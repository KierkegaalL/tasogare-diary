import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetServiceAccountCaches,
  getFirestoreAccessToken,
  mintCustomToken,
  serviceAccountProjectId,
} from '../serviceAccount';
import { ApiError } from '../llm';
import type { Env } from '../env';

// テスト用に実際の RSA 鍵ペアを生成し、サービスアカウント JSON を組み立てる
// （RS256 署名・PEM インポートが実際に成立することを end-to-end で検証する）。
async function makeServiceAccountEnv(): Promise<{ env: Env; publicKey: CryptoKey }> {
  const kp = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const pkcs8 = (await crypto.subtle.exportKey('pkcs8', kp.privateKey)) as ArrayBuffer;
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;

  const sa = {
    client_email: 'svc@proj.iam.gserviceaccount.com',
    private_key: pem,
    project_id: 'tasogare-test',
  };
  return { env: { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa) } as Env, publicKey: kp.publicKey };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(part)) as Record<string, unknown>;
}

async function verifyJwtSignature(jwt: string, publicKey: CryptoKey): Promise<boolean> {
  const [h, p, s] = jwt.split('.');
  const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    sig,
    new TextEncoder().encode(`${h}.${p}`),
  );
}

beforeEach(() => {
  __resetServiceAccountCaches();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mintCustomToken', () => {
  it('identitytoolkit 向けクレームの JWT を発行し、署名が検証できる', async () => {
    const { env, publicKey } = await makeServiceAccountEnv();

    const token = await mintCustomToken(env, 'uid-42');

    const payload = decodeJwtPayload(token);
    expect(payload.uid).toBe('uid-42');
    expect(payload.iss).toBe('svc@proj.iam.gserviceaccount.com');
    expect(payload.sub).toBe('svc@proj.iam.gserviceaccount.com');
    expect(payload.aud).toBe(
      'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    );
    expect(typeof payload.iat).toBe('number');
    expect((payload.exp as number) - (payload.iat as number)).toBe(3600);

    expect(await verifyJwtSignature(token, publicKey)).toBe(true);
  });

  it('FIREBASE_SERVICE_ACCOUNT 未設定は internal(500)', async () => {
    await expect(mintCustomToken({} as Env, 'uid')).rejects.toMatchObject({
      code: 'internal',
      status: 500,
    });
  });

  it('不正な JSON は internal(500)', async () => {
    await expect(
      mintCustomToken({ FIREBASE_SERVICE_ACCOUNT: 'not-json' } as Env, 'uid'),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('getFirestoreAccessToken', () => {
  it('JWT bearer で access_token を取得し、キャッシュする', async () => {
    const { env } = await makeServiceAccountEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'ya29.xxx', expires_in: 3600 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const t1 = await getFirestoreAccessToken(env);
    const t2 = await getFirestoreAccessToken(env);

    expect(t1).toBe('ya29.xxx');
    expect(t2).toBe('ya29.xxx');
    // 2回目はキャッシュから返るため fetch は1回だけ。
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect((init.body as URLSearchParams).get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    );
  });

  it('トークンエンドポイントが失敗したら internal(500)', async () => {
    const { env } = await makeServiceAccountEnv();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }));

    await expect(getFirestoreAccessToken(env)).rejects.toMatchObject({ code: 'internal' });
  });
});

describe('serviceAccountProjectId', () => {
  it('project_id を返す', async () => {
    const { env } = await makeServiceAccountEnv();
    expect(serviceAccountProjectId(env)).toBe('tasogare-test');
  });
});

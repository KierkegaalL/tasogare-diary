import { ApiError } from './llm';
import type { Env } from './env';

// Firebase サービスアカウント（Admin 権限）を用いた署名・トークン取得。
// - カスタムトークン発行（verifyPairingToken）: Firebase カスタムトークン = サービスアカウント秘密鍵で
//   RS256 署名した JWT（identitytoolkit 向け）。Firebase Admin SDK を使わず WebCrypto で自前署名する。
// - Firestore Admin アクセス（pairings の照合/消費、insights の集計・保存、deleteAccount の削除）:
//   サービスアカウントで Google OAuth2 アクセストークンを取得し、Firestore REST を Bearer 認証で呼ぶ。
// - Identity Toolkit Admin アクセス（deleteAccount の Auth ユーザー削除）: 別スコープのアクセストークンを使う。
// - 秘密鍵は Worker Secret（FIREBASE_SERVICE_ACCOUNT）にのみ保持。リポジトリ／クライアントには置かない。

interface ServiceAccount {
  clientEmail: string;
  privateKeyPem: string;
  projectId: string;
}

const IDENTITY_TOOLKIT_AUD =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
// Auth ユーザー削除（deleteAccount）で identitytoolkit の Admin API を呼ぶためのスコープ。
const IDENTITY_TOOLKIT_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';

function parseServiceAccount(env: Env): ServiceAccount {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not set');
    throw new ApiError(500, 'internal', 'サーバ設定エラーが発生しました。');
  }
  try {
    const raw = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as {
      client_email?: string;
      private_key?: string;
      project_id?: string;
    };
    if (!raw.client_email || !raw.private_key || !raw.project_id) {
      throw new Error('missing fields');
    }
    return {
      clientEmail: raw.client_email,
      // Secret に \n がエスケープされて格納されるケースに対応。
      privateKeyPem: raw.private_key.replace(/\\n/g, '\n'),
      projectId: raw.project_id,
    };
  } catch {
    console.error('FIREBASE_SERVICE_ACCOUNT is invalid JSON');
    throw new ApiError(500, 'internal', 'サーバ設定エラーが発生しました。');
  }
}

// ---- base64url / PEM ヘルパー ----
function base64urlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlFromString(input: string): string {
  return base64urlFromBytes(new TextEncoder().encode(input));
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// 秘密鍵（PEM）は Worker インスタンス内でインポート結果をキャッシュする。
let cachedKey: CryptoKey | undefined;
let cachedKeyPem: string | undefined;

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  if (cachedKey && cachedKeyPem === pem) return cachedKey;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  cachedKey = key;
  cachedKeyPem = pem;
  return key;
}

async function signRs256Jwt(
  claims: Record<string, unknown>,
  sa: ServiceAccount,
): Promise<string> {
  const key = await importPrivateKey(sa.privateKeyPem);
  const header = { alg: 'RS256', typ: 'JWT' };
  const unsigned = `${base64urlFromString(JSON.stringify(header))}.${base64urlFromString(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64urlFromBytes(new Uint8Array(signature))}`;
}

// Firebase カスタムトークン（identitytoolkit 向け JWT）を発行する。
export async function mintCustomToken(env: Env, uid: string): Promise<string> {
  const sa = parseServiceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  return signRs256Jwt(
    {
      iss: sa.clientEmail,
      sub: sa.clientEmail,
      aud: IDENTITY_TOOLKIT_AUD,
      uid,
      iat: now,
      exp: now + 3600, // カスタムトークンの最大有効期間は1時間。
    },
    sa,
  );
}

// Google OAuth2 アクセストークン（インスタンス内でスコープごとにキャッシュ）。
const cachedAccessTokens = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(env: Env, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = cachedAccessTokens.get(scope);
  if (cached && cached.expiresAt - 60 > now) {
    return cached.token;
  }
  const sa = parseServiceAccount(env);
  const assertion = await signRs256Jwt(
    {
      iss: sa.clientEmail,
      scope,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    },
    sa,
  );

  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
  } catch {
    throw new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
  if (!res.ok) {
    console.error('Failed to obtain Google access token', res.status);
    throw new ApiError(500, 'internal', 'サーバ設定エラーが発生しました。');
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new ApiError(500, 'internal', 'サーバ設定エラーが発生しました。');
  }
  cachedAccessTokens.set(scope, {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600),
  });
  return body.access_token;
}

// Firestore REST（Admin）用。
export function getFirestoreAccessToken(env: Env): Promise<string> {
  return getAccessToken(env, FIRESTORE_SCOPE);
}

// Identity Toolkit REST（Admin。Auth ユーザー削除）用。
export function getIdentityToolkitAccessToken(env: Env): Promise<string> {
  return getAccessToken(env, IDENTITY_TOOLKIT_SCOPE);
}

export function serviceAccountProjectId(env: Env): string {
  return parseServiceAccount(env).projectId;
}

// テスト用途などでキャッシュを初期化する（インスタンス跨ぎでは不要）。
export function __resetServiceAccountCaches(): void {
  cachedKey = undefined;
  cachedKeyPem = undefined;
  cachedAccessTokens.clear();
}

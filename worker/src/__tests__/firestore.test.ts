import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { consumePairing, createPairing, getPairing } from '../firestore';
import type { Env } from '../env';

vi.mock('../serviceAccount', () => ({
  getFirestoreAccessToken: async () => 'access-token',
  serviceAccountProjectId: () => 'proj-1',
}));

const ENV = {} as Env;
const DOCS_BASE = 'https://firestore.googleapis.com/v1/projects/proj-1/databases/(default)/documents';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createPairing', () => {
  it('documentId 付き POST で pairings を作成する', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await createPairing(ENV, 'tok-1', {
      uid: 'u1',
      createdAt: '2026-07-09T00:00:00.000Z',
      expiresAt: '2026-07-09T00:01:00.000Z',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DOCS_BASE}/pairings?documentId=tok-1`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
    const body = JSON.parse(init.body as string);
    expect(body.fields.uid.stringValue).toBe('u1');
    expect(body.fields.consumed.booleanValue).toBe(false);
    expect(body.fields.expiresAt.timestampValue).toBe('2026-07-09T00:01:00.000Z');
  });

  it('409 は failed-precondition にマッピングする', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({}) });
    await expect(
      createPairing(ENV, 't', { uid: 'u', createdAt: 'a', expiresAt: 'b' }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('getPairing', () => {
  it('404 は null を返す', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    expect(await getPairing(ENV, 'missing')).toBeNull();
  });

  it('ドキュメントをパースして返す', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        fields: {
          uid: { stringValue: 'u9' },
          expiresAt: { timestampValue: '2026-07-09T00:01:00.000Z' },
          consumed: { booleanValue: false },
        },
        updateTime: '2026-07-09T00:00:00.500Z',
      }),
    });

    const doc = await getPairing(ENV, 'tok');
    expect(doc).toEqual({
      uid: 'u9',
      expiresAt: '2026-07-09T00:01:00.000Z',
      consumed: false,
      updateTime: '2026-07-09T00:00:00.500Z',
    });
  });

  it('必須フィールド欠落は null を返す', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ fields: { uid: { stringValue: 'u' } }, updateTime: 't' }),
    });
    expect(await getPairing(ENV, 'tok')).toBeNull();
  });
});

describe('consumePairing', () => {
  it('updateTime を precondition にした PATCH を送る', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await consumePairing(ENV, 'tok', '2026-07-09T00:00:00.500Z');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('updateMask.fieldPaths=consumed');
    expect(url).toContain('currentDocument.updateTime=');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.fields.consumed.booleanValue).toBe(true);
  });

  it('precondition 不一致（HTTP 400 + error.status=FAILED_PRECONDITION）は failed-precondition', async () => {
    // Firestore の currentDocument.updateTime precondition 不一致は HTTP 400 で返る。
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { status: 'FAILED_PRECONDITION' } }),
    });
    await expect(consumePairing(ENV, 'tok', 'ut')).rejects.toMatchObject({
      code: 'failed-precondition',
      status: 400,
    });
  });

  it('競合（HTTP 409 / ABORTED）も failed-precondition', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({}) });
    await expect(consumePairing(ENV, 'tok', 'ut')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});

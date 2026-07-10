import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  consumePairing,
  createPairing,
  getInsight,
  getPairing,
  queryEntriesByDateRange,
  saveInsight,
} from '../firestore';
import type { InsightDoc } from '../firestore';
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

describe('queryEntriesByDateRange', () => {
  it('date 範囲の structuredQuery を送り、本文フィールドは射影しない', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });

    await queryEntriesByDateRange(ENV, 'u1', '2026-07-01', '2026-07-31');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DOCS_BASE}/users/u1:runQuery`);
    expect(init.method).toBe('POST');
    const q = JSON.parse(init.body as string).structuredQuery;
    expect(q.from).toEqual([{ collectionId: 'entries' }]);
    const filters = q.where.compositeFilter.filters;
    expect(filters[0].fieldFilter).toMatchObject({
      field: { fieldPath: 'date' },
      op: 'GREATER_THAN_OR_EQUAL',
      value: { stringValue: '2026-07-01' },
    });
    expect(filters[1].fieldFilter).toMatchObject({
      op: 'LESS_THAN_OR_EQUAL',
      value: { stringValue: '2026-07-31' },
    });
    // 最小取得: bodyText/awareness は select に含めない。
    expect(q.select.fields.map((f: { fieldPath: string }) => f.fieldPath)).toEqual(['date', 'mood', 'words']);
    expect(init.body as string).not.toContain('bodyText');
  });

  it('document を持つ行のみを EntrySummary へパースする', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { readTime: 't' }, // ヒットしない行（document 無し）は無視する。
        {
          document: {
            fields: {
              date: { stringValue: '2026-07-02' },
              mood: { stringValue: 'calm' },
              words: {
                arrayValue: {
                  values: [
                    { mapValue: { fields: { text: { stringValue: '雨' }, category: { stringValue: 'assoc' } } } },
                    { mapValue: { fields: { text: { stringValue: '' } } } }, // 空文字は捨てる
                  ],
                },
              },
            },
          },
        },
        {
          document: {
            fields: { date: { stringValue: '2026-07-03' }, mood: { nullValue: null } },
          },
        },
      ],
    });

    const entries = await queryEntriesByDateRange(ENV, 'u1', '2026-07-01', '2026-07-31');
    expect(entries).toEqual([
      { date: '2026-07-02', mood: 'calm', words: [{ text: '雨', category: 'assoc' }] },
      { date: '2026-07-03', mood: null, words: [] },
    ]);
  });
});

describe('getInsight', () => {
  it('404 は null を返す', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    expect(await getInsight(ENV, 'u1', 'monthly_2026-07')).toBeNull();
  });

  it('ドキュメントをパースして返す（integerValue は数値化）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        fields: {
          type: { stringValue: 'monthly' },
          periodKey: { stringValue: '2026-07' },
          rangeStart: { stringValue: '2026-07-01' },
          rangeEnd: { stringValue: '2026-07-31' },
          moodDistribution: {
            mapValue: {
              fields: {
                calm: { integerValue: '40' },
                tender: { integerValue: '35' },
                heavy: { integerValue: '25' },
              },
            },
          },
          topWords: {
            arrayValue: {
              values: [{ mapValue: { fields: { word: { stringValue: '疲れた' }, count: { integerValue: '12' } } } }],
            },
          },
          narrative: { stringValue: '7月は…' },
          generatedAt: { timestampValue: '2026-08-01T00:00:00.000Z' },
          source: { mapValue: { fields: { model: { stringValue: 'gemini-3.5-flash' } } } },
          schemaVersion: { integerValue: '1' },
        },
      }),
    });

    expect(await getInsight(ENV, 'u1', 'monthly_2026-07')).toEqual({
      type: 'monthly',
      periodKey: '2026-07',
      rangeStart: '2026-07-01',
      rangeEnd: '2026-07-31',
      moodDistribution: { calm: 40, tender: 35, heavy: 25 },
      topWords: [{ word: '疲れた', count: 12 }],
      narrative: '7月は…',
      generatedAt: '2026-08-01T00:00:00.000Z',
      source: { model: 'gemini-3.5-flash' },
      schemaVersion: 1,
    });
  });

  it('必須フィールド欠落は null（再生成させる）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ fields: { type: { stringValue: 'monthly' } } }),
    });
    expect(await getInsight(ENV, 'u1', 'monthly_2026-07')).toBeNull();
  });
});

describe('saveInsight', () => {
  it('PATCH で全フィールドを書き、数値は integerValue(string) で送る', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const doc: InsightDoc = {
      type: 'weekly',
      periodKey: '2026-W27',
      rangeStart: '2026-06-29',
      rangeEnd: '2026-07-05',
      moodDistribution: { calm: 50, tender: 25, heavy: 25 },
      topWords: [{ word: '雨', count: 3 }],
      narrative: 'まとめ',
      generatedAt: '2026-07-06T00:00:00.000Z',
      source: { model: 'gemini-3.5-flash' },
      schemaVersion: 1,
    };

    await saveInsight(ENV, 'u1', 'weekly_2026-W27', doc);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DOCS_BASE}/users/u1/insights/weekly_2026-W27`);
    expect(init.method).toBe('PATCH');
    const fields = JSON.parse(init.body as string).fields;
    expect(fields.moodDistribution.mapValue.fields.calm).toEqual({ integerValue: '50' });
    expect(fields.topWords.arrayValue.values[0].mapValue.fields).toEqual({
      word: { stringValue: '雨' },
      count: { integerValue: '3' },
    });
    expect(fields.generatedAt).toEqual({ timestampValue: '2026-07-06T00:00:00.000Z' });
    expect(fields.schemaVersion).toEqual({ integerValue: '1' });
  });
});

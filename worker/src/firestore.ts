import { ApiError } from './llm';
import type { Env } from './env';
import { getFirestoreAccessToken, serviceAccountProjectId } from './serviceAccount';

// Firestore REST（Admin）アクセス。サービスアカウントのアクセストークンで Bearer 認証する。
// - pairings（QRペアリング短命トークン）の作成・照合・消費（data.md 3.6 / api-contract.md 第5章）
// - entries の期間集計・insights のキャッシュ読み書き（data.md 3.2/3.5 / api-contract.md 3.5）
//   ※ insights はクライアントから書けない（firestore.rules）ため Admin 経由で書き込む。

function documentsBase(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function authHeaders(env: Env): Promise<Record<string, string>> {
  const token = await getFirestoreAccessToken(env);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Firestore REST のエラー応答を api-contract のエラーコードへ写像。
// precondition 不一致（二重消費防止）は Google API 共通仕様では error.status="FAILED_PRECONDITION"（HTTP 400）、
// 競合は "ABORTED"（HTTP 409）で返る。HTTP ステータスだけでは判別できないため error.status も見る。
async function mapFirestoreError(res: Response): Promise<ApiError> {
  const status = res.status;
  let googleStatus = '';
  try {
    const body = (await res.json()) as { error?: { status?: string } };
    googleStatus = body.error?.status ?? '';
  } catch {
    // ボディが読めない場合は HTTP ステータスのみで判定する。
  }

  if (googleStatus === 'FAILED_PRECONDITION' || googleStatus === 'ABORTED' || status === 409) {
    return new ApiError(400, 'failed-precondition', '処理が競合しました。再度お試しください。');
  }
  if (status === 429 || googleStatus === 'RESOURCE_EXHAUSTED') {
    return new ApiError(429, 'resource-exhausted', '混み合っています。少し待って再度お試しください。');
  }
  if (status >= 500) {
    return new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
  console.error('Unexpected Firestore error', status, googleStatus);
  return new ApiError(500, 'internal', '想定外のエラーが発生しました。');
}

// ---- pairings ドキュメント ----
export interface PairingDoc {
  uid: string;
  expiresAt: string; // ISO8601
  consumed: boolean;
  updateTime: string; // 楽観ロック用（consume 時の precondition）
}

// pairings/{token} を作成する（TTL 60秒。data.md 3.6）。
export async function createPairing(
  env: Env,
  token: string,
  fields: { uid: string; createdAt: string; expiresAt: string },
): Promise<void> {
  const projectId = serviceAccountProjectId(env);
  const url = `${documentsBase(projectId)}/pairings?documentId=${encodeURIComponent(token)}`;
  const body = {
    fields: {
      uid: { stringValue: fields.uid },
      createdAt: { timestampValue: fields.createdAt },
      expiresAt: { timestampValue: fields.expiresAt },
      consumed: { booleanValue: false },
    },
  };
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: await authHeaders(env), body: JSON.stringify(body) });
  } catch {
    throw new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
  if (!res.ok) throw await mapFirestoreError(res);
}

// pairings/{token} を取得する。存在しなければ null。
export async function getPairing(env: Env, token: string): Promise<PairingDoc | null> {
  const projectId = serviceAccountProjectId(env);
  const url = `${documentsBase(projectId)}/pairings/${encodeURIComponent(token)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers: await authHeaders(env) });
  } catch {
    throw new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw await mapFirestoreError(res);

  const doc = (await res.json()) as {
    fields?: {
      uid?: { stringValue?: string };
      expiresAt?: { timestampValue?: string };
      consumed?: { booleanValue?: boolean };
    };
    updateTime?: string;
  };
  const uid = doc.fields?.uid?.stringValue;
  const expiresAt = doc.fields?.expiresAt?.timestampValue;
  if (!uid || !expiresAt || !doc.updateTime) return null;
  return {
    uid,
    expiresAt,
    consumed: doc.fields?.consumed?.booleanValue ?? false,
    updateTime: doc.updateTime,
  };
}

// pairings/{token} の consumed を true にする。updateTime を precondition にして二重消費を防ぐ。
// precondition 不一致（他で先に消費された）場合は failed-precondition に写像される（mapFirestoreError）。
export async function consumePairing(env: Env, token: string, updateTime: string): Promise<void> {
  const projectId = serviceAccountProjectId(env);
  const url =
    `${documentsBase(projectId)}/pairings/${encodeURIComponent(token)}` +
    `?updateMask.fieldPaths=consumed&currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
  const body = { fields: { consumed: { booleanValue: true } } };
  let res: Response;
  try {
    res = await fetch(url, { method: 'PATCH', headers: await authHeaders(env), body: JSON.stringify(body) });
  } catch {
    throw new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
  if (!res.ok) throw await mapFirestoreError(res);
}

// ==========================================================================
// entries（期間集計の入力）
// ==========================================================================

// Firestore REST の値表現から必要な型だけを取り出すための最小の型。
interface FsValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  timestampValue?: string;
  nullValue?: null;
  arrayValue?: { values?: FsValue[] };
  mapValue?: { fields?: Record<string, FsValue> };
}

// 集計に必要な最小フィールドのみ（bodyText は取得しない：最小取得の原則、constraints.md）。
export interface EntrySummary {
  date: string;
  mood: string | null;
  words: { text: string; category: string | null }[];
}

// 1期間あたりの取得上限（1日1件想定・月次でも31件）。異常データ時の安全弁。
const MAX_ENTRIES_PER_PERIOD = 200;

// users/{uid}/entries を date の範囲（YYYY-MM-DD の文字列比較）で取得する。
// bodyText / awareness など本文系は select で射影から除外し、集計に要る分だけを読む。
export async function queryEntriesByDateRange(
  env: Env,
  uid: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<EntrySummary[]> {
  const projectId = serviceAccountProjectId(env);
  const url = `${documentsBase(projectId)}/users/${encodeURIComponent(uid)}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'entries' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'date' },
                op: 'GREATER_THAN_OR_EQUAL',
                value: { stringValue: rangeStart },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'date' },
                op: 'LESS_THAN_OR_EQUAL',
                value: { stringValue: rangeEnd },
              },
            },
          ],
        },
      },
      select: { fields: [{ fieldPath: 'date' }, { fieldPath: 'mood' }, { fieldPath: 'words' }] },
      limit: MAX_ENTRIES_PER_PERIOD,
    },
  };

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: await authHeaders(env), body: JSON.stringify(body) });
  } catch {
    throw new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
  if (!res.ok) throw await mapFirestoreError(res);

  // runQuery は行の配列を返す。ヒットしない行には document が無い。
  const rows = (await res.json()) as { document?: { fields?: Record<string, FsValue> } }[];
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((row) => {
    const fields = row.document?.fields;
    const date = fields?.date?.stringValue;
    if (!date) return [];
    const words = (fields?.words?.arrayValue?.values ?? [])
      .map((v) => ({
        text: v.mapValue?.fields?.text?.stringValue ?? '',
        category: v.mapValue?.fields?.category?.stringValue ?? null,
      }))
      .filter((w) => w.text.length > 0);
    return [{ date, mood: fields?.mood?.stringValue ?? null, words }];
  });
}

// ==========================================================================
// insights（週次/月次まとめのキャッシュ）
// ==========================================================================

export interface InsightDoc {
  type: 'weekly' | 'monthly';
  periodKey: string;
  rangeStart: string;
  rangeEnd: string;
  moodDistribution: { calm: number; tender: number; heavy: number };
  topWords: { word: string; count: number }[];
  narrative: string;
  generatedAt: string; // ISO8601
  source: { model: string };
  schemaVersion: number;
}

function insightUrl(projectId: string, uid: string, periodId: string): string {
  return `${documentsBase(projectId)}/users/${encodeURIComponent(uid)}/insights/${encodeURIComponent(periodId)}`;
}

// users/{uid}/insights/{periodId} を取得する。存在しない・形が壊れている場合は null（再生成させる）。
export async function getInsight(env: Env, uid: string, periodId: string): Promise<InsightDoc | null> {
  const projectId = serviceAccountProjectId(env);
  let res: Response;
  try {
    res = await fetch(insightUrl(projectId, uid, periodId), { method: 'GET', headers: await authHeaders(env) });
  } catch {
    throw new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw await mapFirestoreError(res);

  const doc = (await res.json()) as { fields?: Record<string, FsValue> };
  const f = doc.fields;
  const type = f?.type?.stringValue;
  const periodKey = f?.periodKey?.stringValue;
  const narrative = f?.narrative?.stringValue;
  const generatedAt = f?.generatedAt?.timestampValue;
  const rangeStart = f?.rangeStart?.stringValue;
  const rangeEnd = f?.rangeEnd?.stringValue;
  if (
    (type !== 'weekly' && type !== 'monthly') ||
    !periodKey ||
    !rangeStart ||
    !rangeEnd ||
    typeof narrative !== 'string' ||
    !generatedAt
  ) {
    return null;
  }

  const moodFields = f?.moodDistribution?.mapValue?.fields;
  const num = (v?: FsValue): number => Number(v?.integerValue ?? 0);
  return {
    type,
    periodKey,
    rangeStart,
    rangeEnd,
    moodDistribution: {
      calm: num(moodFields?.calm),
      tender: num(moodFields?.tender),
      heavy: num(moodFields?.heavy),
    },
    topWords: (f?.topWords?.arrayValue?.values ?? [])
      .map((v) => ({
        word: v.mapValue?.fields?.word?.stringValue ?? '',
        count: num(v.mapValue?.fields?.count),
      }))
      .filter((w) => w.word.length > 0),
    narrative,
    generatedAt,
    source: { model: f?.source?.mapValue?.fields?.model?.stringValue ?? '' },
    schemaVersion: num(f?.schemaVersion),
  };
}

// users/{uid}/insights/{periodId} を全フィールド上書きで保存する（PATCH は存在しなければ作成する）。
export async function saveInsight(env: Env, uid: string, periodId: string, doc: InsightDoc): Promise<void> {
  const projectId = serviceAccountProjectId(env);
  // integerValue は REST 仕様上 string（int64）で送る。
  const int = (n: number): FsValue => ({ integerValue: String(Math.trunc(n)) });
  const body = {
    fields: {
      type: { stringValue: doc.type },
      periodKey: { stringValue: doc.periodKey },
      rangeStart: { stringValue: doc.rangeStart },
      rangeEnd: { stringValue: doc.rangeEnd },
      moodDistribution: {
        mapValue: {
          fields: {
            calm: int(doc.moodDistribution.calm),
            tender: int(doc.moodDistribution.tender),
            heavy: int(doc.moodDistribution.heavy),
          },
        },
      },
      topWords: {
        arrayValue: {
          values: doc.topWords.map((w) => ({
            mapValue: { fields: { word: { stringValue: w.word }, count: int(w.count) } },
          })),
        },
      },
      narrative: { stringValue: doc.narrative },
      generatedAt: { timestampValue: doc.generatedAt },
      source: { mapValue: { fields: { model: { stringValue: doc.source.model } } } },
      schemaVersion: int(doc.schemaVersion),
    },
  };

  let res: Response;
  try {
    res = await fetch(insightUrl(projectId, uid, periodId), {
      method: 'PATCH',
      headers: await authHeaders(env),
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
  if (!res.ok) throw await mapFirestoreError(res);
}

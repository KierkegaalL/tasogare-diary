import { ApiError } from './llm';
import type { Env } from './env';
import { getFirestoreAccessToken, serviceAccountProjectId } from './serviceAccount';

// Firestore REST（Admin）アクセス。サービスアカウントのアクセストークンで Bearer 認証する。
// - pairings（QRペアリング短命トークン）の作成・照合・消費（data.md 3.6 / api-contract.md 第5章）
// - entries の期間集計・insights のキャッシュ読み書き（data.md 3.2/3.5 / api-contract.md 3.5）
//   ※ insights はクライアントから書けない（firestore.rules）ため Admin 経由で書き込む。
// - アカウント削除のサブツリー削除（data.md 第7章 / api-contract.md 第6章）
//   ※ Firestore REST にはサブツリー一括削除 API が無いため、collection group クエリで子孫を集めて消す。

function documentsBase(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

// documents:commit の Write.delete 等に渡すリソース名（Firestore がドキュメントに割り当てる
// `document.name` と同じ形式）。documentsBase() はリクエスト URL 用の完全な HTTP URL であり、
// スキーム・ホスト・バージョン（https://firestore.googleapis.com/v1/）を含む点が異なる。
function documentResourceName(projectId: string, docPath: string): string {
  return `projects/${projectId}/databases/(default)/documents/${docPath}`;
}

async function authHeaders(env: Env): Promise<Record<string, string>> {
  const token = await getFirestoreAccessToken(env);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Firestore REST を Admin 認証付きで呼ぶ。ネットワーク断は unavailable に写像する（レスポンスの
// 判定は呼び出し側。404 を許容するかどうかがエンドポイントごとに違うため）。
// 呼び出し側の headers は保持し、認証ヘッダを後勝ちで重ねる。
async function firestoreFetch(env: Env, url: string, init: RequestInit): Promise<Response> {
  try {
    const headers = { ...(init.headers as Record<string, string> | undefined), ...(await authHeaders(env)) };
    return await fetch(url, { ...init, headers });
  } catch {
    throw new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
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
  const res = await firestoreFetch(env, url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw await mapFirestoreError(res);
}

// pairings/{token} を取得する。存在しなければ null。
export async function getPairing(env: Env, token: string): Promise<PairingDoc | null> {
  const projectId = serviceAccountProjectId(env);
  const url = `${documentsBase(projectId)}/pairings/${encodeURIComponent(token)}`;
  const res = await firestoreFetch(env, url, { method: 'GET' });
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
  const res = await firestoreFetch(env, url, { method: 'PATCH', body: JSON.stringify(body) });
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

  const res = await firestoreFetch(env, url, { method: 'POST', body: JSON.stringify(body) });
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
  type: 'weekly' | 'monthly' | 'quarterly';
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
  const res = await firestoreFetch(env, insightUrl(projectId, uid, periodId), { method: 'GET' });
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
    (type !== 'weekly' && type !== 'monthly' && type !== 'quarterly') ||
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

  const res = await firestoreFetch(env, insightUrl(projectId, uid, periodId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await mapFirestoreError(res);
}


// ==========================================================================
// アカウント削除（api-contract.md 第6章・data.md 第7章）
// ==========================================================================

// Firestore REST にはサブツリー一括削除（Admin SDK の recursiveDelete 相当）が無い。
// ドキュメントを1件ずつ辿ると Firestore への呼び出し回数が日記の件数に比例して増え、
// Cloudflare Workers の「1リクエストあたりのサブリクエスト数」上限（無料プランで50）に達しうる。
// そこで collection group クエリ（from[].allDescendants=true）を使い、
// **コレクション ID ごとに1回の runQuery で任意の深さの子孫をまとめて取得**する。
// 呼び出し回数はデータ量によらずコレクション ID の数（数回）で一定になる。
//
// 取得は `select: ['__name__']`（公式のキーのみ射影）でドキュメント名だけを読み、日記本文は取得しない。
// 削除は documents:commit（バッチ書込・500件ずつ）。存在しない名前への delete は no-op のため、
// 途中失敗後の再実行が安全（冪等）。

const COMMIT_BATCH_SIZE = 500; // commit の書込上限。

// users/{uid} 配下に存在しうるコレクション ID（data.md 3.2〜3.5）。
// `messages` は entries の下の入れ子なので、users/{uid} の直下列挙（listCollectionIds）には現れない。
// 想定外のコレクションが直下に増えた場合は listCollectionIds 側で検出して削除対象に加える。
const KNOWN_USER_SUBCOLLECTION_IDS = ['entries', 'messages', 'wordStats', 'insights'] as const;

// ドキュメント直下のサブコレクション ID を列挙する（スキーマ逸脱の検出用）。
async function listCollectionIds(env: Env, projectId: string, docPath: string): Promise<string[]> {
  const url = `${documentsBase(projectId)}/${docPath}:listCollectionIds`;
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await firestoreFetch(env, url, {
      method: 'POST',
      body: JSON.stringify(pageToken ? { pageToken } : {}),
    });
    if (res.status === 404) return ids; // 親ドキュメントが無ければ列挙結果も無い。
    if (!res.ok) throw await mapFirestoreError(res);
    const body = (await res.json()) as { collectionIds?: string[]; nextPageToken?: string };
    ids.push(...(body.collectionIds ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return ids;
}

// parentDocPath の子孫のうち、collectionId 名のコレクションに属するドキュメント名を全件取得する。
// allDescendants=true により、直下でなく入れ子（entries/{id}/messages）でも1回で拾える。
async function queryDescendantNames(
  env: Env,
  projectId: string,
  parentDocPath: string,
  collectionId: string,
): Promise<string[]> {
  const url = `${documentsBase(projectId)}/${parentDocPath}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId, allDescendants: true }],
      // ドキュメント名のみ返す（本文は読まない）。
      select: { fields: [{ fieldPath: '__name__' }] },
    },
  };
  const res = await firestoreFetch(env, url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw await mapFirestoreError(res);

  const rows = (await res.json()) as { document?: { name?: string } }[];
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => (row.document?.name ? [row.document.name] : []));
}

// フルリソース名の配列を commit でまとめて削除する（存在しない名前は no-op）。
async function commitDeletes(env: Env, projectId: string, names: string[]): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  for (let i = 0; i < names.length; i += COMMIT_BATCH_SIZE) {
    const writes = names.slice(i, i + COMMIT_BATCH_SIZE).map((name) => ({ delete: name }));
    const res = await firestoreFetch(env, url, { method: 'POST', body: JSON.stringify({ writes }) });
    if (!res.ok) throw await mapFirestoreError(res);
  }
}

// users/{uid} とその配下（entries / messages / wordStats / insights）をすべて削除する。
// 戻り値は削除対象として送ったドキュメント数（users/{uid} 自身を含む）。
export async function deleteUserData(env: Env, uid: string): Promise<number> {
  const projectId = serviceAccountProjectId(env);
  const userDocPath = `users/${uid}`;

  // 直下の実コレクションを見て、既知スキーマに無いものがあれば削除対象に加える（取りこぼし防止）。
  const discovered = await listCollectionIds(env, projectId, userDocPath);
  const unknown = discovered.filter(
    (id) => !(KNOWN_USER_SUBCOLLECTION_IDS as readonly string[]).includes(id),
  );
  if (unknown.length > 0) {
    console.warn('Unknown subcollections under user document', unknown);
  }
  const collectionIds = [...new Set([...KNOWN_USER_SUBCOLLECTION_IDS, ...discovered])];

  const names: string[] = [];
  for (const collectionId of collectionIds) {
    names.push(...(await queryDescendantNames(env, projectId, userDocPath, collectionId)));
  }
  // 親ドキュメント自身は最後に消す（順序は必須ではないが、途中失敗時に users/{uid} が残る方が再実行しやすい）。
  names.push(documentResourceName(projectId, userDocPath));

  await commitDeletes(env, projectId, names);
  return names.length;
}

// 当該 uid が発行した pairings（トップレベル）をすべて削除する。
export async function deletePairingsForUid(env: Env, uid: string): Promise<number> {
  const projectId = serviceAccountProjectId(env);
  const url = `${documentsBase(projectId)}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'pairings' }],
      where: {
        fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } },
      },
      // ドキュメント名だけ取れればよい（トークン等の中身は読まない）。
      select: { fields: [{ fieldPath: '__name__' }] },
    },
  };

  const res = await firestoreFetch(env, url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw await mapFirestoreError(res);

  const rows = (await res.json()) as { document?: { name?: string } }[];
  if (!Array.isArray(rows)) return 0;
  const names = rows.flatMap((row) => (row.document?.name ? [row.document.name] : []));
  await commitDeletes(env, projectId, names);
  return names.length;
}

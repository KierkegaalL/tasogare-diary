import { ApiError } from './llm';
import type { Env } from './env';
import { getFirestoreAccessToken, serviceAccountProjectId } from './serviceAccount';

// Firestore REST（Admin）アクセス。サービスアカウントのアクセストークンで Bearer 認証する。
// pairings（QRペアリング短命トークン）の作成・照合・消費に用いる（data.md 3.6 / api-contract.md 第5章）。

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

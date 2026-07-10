import { ApiError } from './llm';
import type { Env } from './env';
import { deletePairingsForUid, deleteUserData } from './firestore';
import { getIdentityToolkitAccessToken, serviceAccountProjectId } from './serviceAccount';

// deleteAccount — アカウント削除（api-contract.md 第6章 / data.md 第7章）。
//
// 削除順序が重要:
//   1. Firestore の users/{uid} サブツリー（entries + messages + wordStats + insights）
//   2. pairings の当該 uid 文書
//   3. Auth ユーザー
// Auth を最後にするのは、途中で失敗しても uid が残っていれば同じ ID トークンで再実行できるため。
// 逆順（Auth を先に消す）だと、Firestore にデータが残ったまま本人が再認証できなくなり、
// 誰も消せない孤児データが生まれる。
//
// 冪等性: Firestore の delete は存在しないドキュメントに対して no-op。Auth ユーザー削除も
// USER_NOT_FOUND を成功扱いにする。したがって途中失敗後の再実行で完了できる。

const IDENTITY_TOOLKIT_BASE = 'https://identitytoolkit.googleapis.com/v1';

// Firebase Auth のユーザーを削除する（Admin API）。既に存在しない場合も成功として扱う。
async function deleteAuthUser(env: Env, uid: string): Promise<void> {
  const projectId = serviceAccountProjectId(env);
  const token = await getIdentityToolkitAccessToken(env);

  let res: Response;
  try {
    res = await fetch(`${IDENTITY_TOOLKIT_BASE}/projects/${projectId}/accounts:delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: uid }),
    });
  } catch {
    throw new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
  if (res.ok) return;

  let message = '';
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    message = body.error?.message ?? '';
  } catch {
    // ボディが読めない場合はステータスのみで判定する。
  }

  // 既に削除済み（再実行時）は成功扱い。
  if (message.startsWith('USER_NOT_FOUND')) return;

  if (res.status === 429) {
    throw new ApiError(429, 'resource-exhausted', '混み合っています。少し待って再度お試しください。');
  }
  if (res.status >= 500) {
    throw new ApiError(503, 'unavailable', '一時的に処理できませんでした。再度お試しください。');
  }
  // エラー本文は uid 等を含みうるためログに残さない（api-contract.md 第8章）。
  // 切り分けに要るのはエラー種別までなので、`:` より前の識別子だけを出す。
  console.error('Failed to delete auth user', res.status, message.split(':')[0]);
  throw new ApiError(500, 'internal', '想定外のエラーが発生しました。');
}

export interface DeleteAccountResult {
  deleted: true;
}

export async function handleDeleteAccount(env: Env, uid: string): Promise<DeleteAccountResult> {
  // 件数はログに残すが、uid や本文は残さない（api-contract.md 第8章）。
  const documents = await deleteUserData(env, uid);
  const pairings = await deletePairingsForUid(env, uid);
  await deleteAuthUser(env, uid);

  console.log('deleteAccount completed', { documents, pairings });
  return { deleted: true };
}

import { callWorker, isWorkerConfigured } from './worker';

// アカウント削除（Web / api-contract.md 第6章・data.md 第7章）。
// Firestore サブツリー・pairings・Auth ユーザーの削除はすべて Worker（Admin 権限）が行う
// （モバイルの src/services/account.ts と同じエンドポイントを ID トークン付きで呼ぶだけ）。
// 呼び出し後、Auth ユーザーが消えるため現在の ID トークンは無効になる。呼び出し側は
// サインアウト相当の画面（/connect）へ戻すこと。

// Worker 未設定では提供しない。削除は不可逆なため「削除できたふり」をしない方針
// （モバイルと同じ判断・constraints.md）。
export const isAccountDeletionAvailable = isWorkerConfigured;

export interface DeleteAccountResponse {
  deleted: true;
}

export async function deleteAccount(): Promise<DeleteAccountResponse> {
  return callWorker<Record<string, never>, DeleteAccountResponse>('/deleteAccount', {});
}

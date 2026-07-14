import { callClaudeWorker } from './claudeWorker/client';
import { isClaudeWorkerConfigured } from './claudeWorker/config';

// アカウント削除（api-contract.md 第6章 / data.md 第7章）。
// Firestore サブツリー・pairings・Auth ユーザーの削除はすべて Worker（Admin 権限）が行う。
// クライアントは自分の ID トークンを付けて呼ぶだけで、削除範囲の判断はサーバに委ねる。
//
// 呼び出し後、Auth ユーザーが消えるため現在の ID トークンは無効になる。呼び出し側は
// ローカル状態（stores / AsyncStorage）を破棄してサインアウト相当の画面に戻すこと。
//
// UI（設定画面の削除導線）は実装済み（SettingsScreen.tsx の DeleteAccountSection。2段階確認。screen.md 3.9）。

// Worker 未設定（モック運用）ではアカウント削除を提供しない。
// 削除は不可逆なため、モックで「削除できたふり」をしない方針。
export const isAccountDeletionAvailable = isClaudeWorkerConfigured;

export interface DeleteAccountResponse {
  deleted: true;
}

export async function deleteAccount(): Promise<DeleteAccountResponse> {
  return callClaudeWorker<Record<string, never>, DeleteAccountResponse>('/deleteAccount', {});
}

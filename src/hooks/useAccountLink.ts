import { useAuthStore } from '../stores/authStore';
import { canLinkAccount } from '../services/auth';
import type { AccountLinkKind } from '../services/auth';

const LINK_KINDS: AccountLinkKind[] = ['apple', 'google'];

// 匿名アカウントを Apple/Google の恒久アカウントへ昇格できる kind 一覧を返す
// （environments.md）。既に恒久化済み（provider !== 'anonymous'）、またはネイティブ
// 資格情報ソース未導入の環境（既定の Expo Go 等）では空配列＝昇格不可を表す。
// WebConnectScreen の連携UI（AccountLinkSection）と設定画面のバックアップ行で
// 同じ判定を使うため共通化する（判定がずれると「押しても何も起きない」導線になるため）。
export function useLinkableAccountKinds(): AccountLinkKind[] {
  const provider = useAuthStore((s) => s.user?.provider);
  if (provider !== 'anonymous') return [];
  return LINK_KINDS.filter((k) => canLinkAccount(k));
}

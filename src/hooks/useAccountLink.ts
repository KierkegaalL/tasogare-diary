import { useAuthStore } from '../stores/authStore';
import { canLinkAccount } from '../services/auth';
import type { AccountLinkKind } from '../services/auth';

const LINK_KINDS: AccountLinkKind[] = ['apple', 'google'];

// 匿名アカウントを Apple/Google の恒久アカウントへ昇格できる kind 一覧を返す
// （environments.md）。既に恒久化済み（isAnonymous === false）、またはネイティブ
// 資格情報ソース未導入の環境（既定の Expo Go 等）では空配列＝昇格不可を表す。
// 設定画面（SettingsScreen）の連携UI（AccountLinkSection）で使用する。
//
// 判定は user.provider ではなく isAnonymous を見る（実機検証で発覚した不具合の修正）:
// firebaseAuthProvider/nativeFirebaseAuthProvider の init()/restore() は toAuthUser() 経由で
// provider を常に 'anonymous' 固定文字列で返す設計のため（linkWith 直後の戻り値のみ provider=kind）、
// アプリ再起動後の復元では連携済みでも provider==='anonymous' のままになる。恒久化したかどうかの
// 実体は isAnonymous（SettingsScreen の WebAccountRow 等が既に使っている判定軸）で見る必要がある。
export function useLinkableAccountKinds(): AccountLinkKind[] {
  const user = useAuthStore((s) => s.user);
  // fail-safe: isAnonymous が明示的に true の場合のみ導線を出す（未設定の AuthProvider 実装が将来
  // 追加された場合に誤って導線を出してしまわないよう、"false でなければ表示" ではなく "true のときだけ
  // 表示" にする。reviewer指摘）。
  if (!user || user.isAnonymous !== true) return [];
  return LINK_KINDS.filter((k) => canLinkAccount(k));
}

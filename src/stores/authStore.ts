import { Platform } from 'react-native';
import { create } from 'zustand';

import { getAuthProvider, AuthLinkError } from '../services/auth';
import { localAuthProvider } from '../services/auth/localAuthProvider';
import { isFirebaseConfigured } from '../services/firebase/config';
import type { AccountLinkKind, AuthUser } from '../services/auth';

// 'needs-connect' は Web版（Platform.OS === 'web'）専用。既存セッションが無いとき、自動で匿名
// セッションを発行せず連携画面（WebConnectGate）を表示する（ユーザー指摘: Webとモバイルで
// 同じ日記を見られるようにするため）。
type AuthStatus = 'loading' | 'authenticated' | 'error' | 'needs-connect';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * 匿名アカウントを Apple/Google の恒久アカウントへリンク昇格する（uid・データ維持）。
   * 成功で user を更新。失敗は AuthLinkError を投げて UI に委ねる（状態は変えない）。
   */
  linkAccount: (kind: AccountLinkKind) => Promise<void>;
  /** WebConnectGate が QR/コード/Google/ゲストのいずれかでセッションを確立したときに呼ぶ。 */
  completeConnect: (user: AuthUser) => void;
  /**
   * Web版の設定画面「スマホと連携する」/「ログアウトする」から呼ぶ。現在のセッションを終了し、
   * 連携画面へ戻す（サインアウト失敗は無視して戻す＝連携画面側で新しいセッションに上書きされる）。
   */
  requestWebConnect: () => Promise<void>;
}

// 認証状態（architecture.md 第4.2節 authStore）。
// 既定はローカル匿名プロバイダ。uid は entries/messages のスコープに用いる（次の Firestore ステップ）。
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  initialize: async () => {
    try {
      const provider = getAuthProvider();
      // 既存セッションを復元。
      const restored = await provider.init();
      if (restored) {
        set({ user: restored, status: 'authenticated' });
        return;
      }
      // Web版で既存セッションが無ければ、連携画面へ（自動で匿名IDを発行しない）。
      if (Platform.OS === 'web' && isFirebaseConfigured) {
        set({ status: 'needs-connect' });
        return;
      }
      // ネイティブはログイン不要のため自動で匿名IDを発行する。
      const user = await provider.signIn();
      set({ user, status: 'authenticated' });
    } catch {
      // フォールバック: 設定プロバイダ（Firebase 匿名認証等）が失敗（例: 初回起動オフライン、
      // signInAnonymously はネットワーク必須）した場合、ローカル匿名IDで最低限の動作を確保する。
      // TODO(Phase2): オンライン復帰時に local uid → Firebase uid の突合/移行を実装する。
      try {
        const restored = await localAuthProvider.init();
        if (restored) {
          set({ user: restored, status: 'authenticated' });
          return;
        }
        // このフォールバック経路でも Web版のガードは維持する（reviewer指摘: ここを素通りすると
        // 「Web版では自動で匿名セッションを発行しない」という前提が静かに破られてしまう）。
        if (Platform.OS === 'web' && isFirebaseConfigured) {
          set({ status: 'needs-connect' });
          return;
        }
        const user = await localAuthProvider.signIn();
        set({ user, status: 'authenticated' });
      } catch {
        set({ user: null, status: 'error' });
      }
    }
  },
  linkAccount: async (kind: AccountLinkKind) => {
    const provider = getAuthProvider();
    if (!provider.linkWith) {
      // ローカル匿名プロバイダ等は昇格非対応。UI は canLinkAccount で導線を出さない前提だが二重の防御。
      throw new AuthLinkError('unavailable', 'この環境ではアカウント連携を利用できません。');
    }
    const user = await provider.linkWith(kind);
    set({ user, status: 'authenticated' });
  },
  signOut: async () => {
    const provider = getAuthProvider();
    // 復帰不能（loading のまま）を避けるため、サインアウト後に匿名セッションを再確立する。
    // TODO(Phase2 Firebase): 実サインアウトでは再サインインに対話が必要になるため、
    //   その際にサインイン画面への遷移等へ本フローを見直す。
    // 失敗時も内部状態は 'error' にするが、呼び出し元が成功/失敗を判別できるよう rethrow する
    // （例: アカウント削除後の再匿名化失敗を「削除自体が失敗した」と誤表示しないため。reviewer指摘）。
    try {
      await provider.signOut();
      const user = await provider.signIn();
      set({ user, status: 'authenticated' });
    } catch (err) {
      set({ user: null, status: 'error' });
      throw err;
    }
  },
  completeConnect: (user: AuthUser) => {
    set({ user, status: 'authenticated' });
  },
  requestWebConnect: async () => {
    const provider = getAuthProvider();
    try {
      await provider.signOut();
    } catch {
      // 失敗しても連携画面へは戻す（新しいセッションで上書きされる）。
    }
    set({ user: null, status: 'needs-connect' });
  },
}));

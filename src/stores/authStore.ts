import { create } from 'zustand';

import { getAuthProvider } from '../services/auth';
import { localAuthProvider } from '../services/auth/localAuthProvider';
import type { AuthUser } from '../services/auth';

type AuthStatus = 'loading' | 'authenticated' | 'error';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

// 認証状態（architecture.md 第4.2節 authStore）。
// 既定はローカル匿名プロバイダ。uid は entries/messages のスコープに用いる（次の Firestore ステップ）。
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  initialize: async () => {
    try {
      const provider = getAuthProvider();
      // 既存セッションを復元。無ければ自動で匿名IDを発行（モバイルはログイン不要）。
      const restored = await provider.init();
      const user = restored ?? (await provider.signIn());
      set({ user, status: 'authenticated' });
    } catch {
      // フォールバック: 設定プロバイダ（Firebase 匿名認証等）が失敗（例: 初回起動オフライン、
      // signInAnonymously はネットワーク必須）した場合、ローカル匿名IDで最低限の動作を確保する。
      // TODO(Phase2): オンライン復帰時に local uid → Firebase uid の突合/移行を実装する。
      try {
        const restored = await localAuthProvider.init();
        const user = restored ?? (await localAuthProvider.signIn());
        set({ user, status: 'authenticated' });
      } catch {
        set({ user: null, status: 'error' });
      }
    }
  },
  signOut: async () => {
    const provider = getAuthProvider();
    // 復帰不能（loading のまま）を避けるため、サインアウト後に匿名セッションを再確立する。
    // TODO(Phase2 Firebase): 実サインアウトでは再サインインに対話が必要になるため、
    //   その際にサインイン画面への遷移等へ本フローを見直す。
    try {
      await provider.signOut();
      const user = await provider.signIn();
      set({ user, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'error' });
    }
  },
}));

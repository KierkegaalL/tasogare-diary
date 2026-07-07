import { create } from 'zustand';

import { getAuthProvider } from '../services/auth';
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
      set({ user: null, status: 'error' });
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

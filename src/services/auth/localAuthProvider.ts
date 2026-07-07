import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AuthProvider, AuthUser } from './types';
import { makeId } from '../../utils/id';

const UID_KEY = 'tasogare-auth-uid';

// ローカル匿名プロバイダ（Phase1/開発時の既定）。
// 端末に uid を発行・永続し、ログイン画面なしでユーザーIDを確立する。
// visual-design.html ではモバイルにログイン画面は無く、サインインは「Webで見る」/バックアップ時のみ。
// Phase2 で Firebase 認証情報＋開発ビルドが揃い次第、firebaseAuthProvider へ切り替える。
export const localAuthProvider: AuthProvider = {
  async init() {
    const uid = await AsyncStorage.getItem(UID_KEY);
    return uid ? { uid, provider: 'local' } : null;
  },
  async signIn() {
    let uid = await AsyncStorage.getItem(UID_KEY);
    if (!uid) {
      uid = makeId('u');
      await AsyncStorage.setItem(UID_KEY, uid);
    }
    const user: AuthUser = { uid, provider: 'local' };
    return user;
  },
  async signOut() {
    await AsyncStorage.removeItem(UID_KEY);
  },
};

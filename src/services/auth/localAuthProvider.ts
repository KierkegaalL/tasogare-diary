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
    // isAnonymous: true — 恒久アカウントへの連携がそもそも存在しないプロバイダのため常に匿名扱い
    // （Web版 SettingsScreen の WebAccountRow が「スマホと連携する」/「ログアウトする」を正しく
    // 出し分けられるように。reviewer指摘: 未設定だと連携済みと誤認される）。
    return uid ? { uid, provider: 'local', isAnonymous: true } : null;
  },
  async signIn() {
    let uid = await AsyncStorage.getItem(UID_KEY);
    if (!uid) {
      uid = makeId('u');
      await AsyncStorage.setItem(UID_KEY, uid);
    }
    const user: AuthUser = { uid, provider: 'local', isAnonymous: true };
    return user;
  },
  async signOut() {
    await AsyncStorage.removeItem(UID_KEY);
  },
};

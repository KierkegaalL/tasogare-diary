import { getApp, getApps, initializeApp } from 'firebase/app';
import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import type { Auth, Persistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { firebaseConfig } from './config';

// firebase v12: RN 永続化関数は型に露出していないため実行時に解決する。
// メトロは 'firebase/auth' を RN ビルドへ解決し getReactNativePersistence を提供する。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const authRuntime = require('firebase/auth') as {
  getReactNativePersistence?: (storage: unknown) => Persistence;
};

let appInstance: FirebaseApp | undefined;
let authInstance: Auth | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig as FirebaseOptions);
  }
  return appInstance;
}

// AsyncStorage 永続で Auth を初期化（セッションが再起動をまたいで保持される）。
export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    const app = getFirebaseApp();
    const persistence = authRuntime.getReactNativePersistence?.(AsyncStorage);
    if (!persistence) {
      // RN 永続化が取得できない場合は永続なしにフォールバック（再起動でセッションが失われる）。
      console.warn('[firebase] getReactNativePersistence 未取得: 永続化なしで Auth を初期化します');
    }
    try {
      // Fast Refresh 等で initializeAuth が二重呼び出しになると例外になるため getAuth にフォールバック。
      authInstance = persistence ? initializeAuth(app, { persistence }) : getAuth(app);
    } catch {
      authInstance = getAuth(app);
    }
  }
  return authInstance;
}

import { getApp, getApps, initializeApp } from 'firebase/app';
import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

// Firebase クライアント設定（公開可能なクライアント値のみ／シークレットではない）。
// モバイル（src/services/firebase/config.ts）と同一プロジェクトの値を NEXT_PUBLIC_* から読み込む。
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} as const;

// 認証に必要なコアキーが揃っている場合のみ Firebase を有効とみなす（モバイルと同判定）。
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig as FirebaseOptions);
}

let authInstance: Auth | undefined;

// ブラウザの localStorage 永続でセッションを保持（QR サインイン後、再訪でも維持）。
export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
    void setPersistence(authInstance, browserLocalPersistence);
  }
  return authInstance;
}

export function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

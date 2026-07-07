// Firebase クライアント設定。公開可能なクライアント設定のみ（シークレットではない）。
// 値は環境変数（EXPO_PUBLIC_*）から読み込む。未設定なら Firebase 無効（ローカル認証で動作）。
// environments.md の環境定義に対応。実プロジェクト作成時に .env / EAS 環境へ設定する。
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
} as const;

// 認証に必要なコアキーが揃っている場合のみ Firebase を有効とみなす。
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

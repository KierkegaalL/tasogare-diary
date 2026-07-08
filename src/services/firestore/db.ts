import { getFirestore, initializeFirestore } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

import { getFirebaseApp } from '../firebase/app';

let dbInstance: Firestore | undefined;

// Firestore インスタンス（Firebase 設定時のみ到達）。
// - RN では接続に long polling が必要になる場合があるため有効化する。
// - オフライン永続は JS SDK の RN 制約によりメモリキャッシュ中心（IndexedDB 不在）。
//   完全な永続化は将来 @react-native-firebase（ネイティブ）等で対応する（architecture.md 第7章）。
export function getFirestoreDb(): Firestore {
  if (!dbInstance) {
    const app = getFirebaseApp();
    try {
      dbInstance = initializeFirestore(app, { experimentalForceLongPolling: true });
    } catch {
      // 既に初期化済みの場合は取得のみ。
      dbInstance = getFirestore(app);
    }
  }
  return dbInstance;
}

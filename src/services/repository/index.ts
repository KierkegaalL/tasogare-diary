import type { EntriesRepository, MessagesRepository } from './types';
import { localEntriesRepository } from './localEntriesRepository';
import { localMessagesRepository } from './localMessagesRepository';
import { isFirebaseConfigured } from '../firebase/config';
import { shouldUseNativeFirebase } from '../firebase/nativeFirebaseFlag';

export type { EntriesRepository, MessagesRepository } from './types';

// Firebase 設定時のみ Firestore 実装を読み込む（未設定時は firestore を実行/バンドルしない）。
// ネイティブ Firebase フラグ有効時（開発/配布ビルドのみ・Web/Expo Go 既定は false）は
// @react-native-firebase/firestore 版を動的 require する（ネイティブモジュールを Expo Go
// バンドルに引き込まないため。migration-react-native-firebase.md 第3章・第6章）。Auth も同じ
// フラグで揃ってネイティブ経路へ切り替わる（第2章: Firestore だけの移行では権限拒否になるため）。
export function getEntriesRepository(): EntriesRepository {
  if (!isFirebaseConfigured) return localEntriesRepository;
  if (shouldUseNativeFirebase()) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./nativeFirestoreEntriesRepository') as typeof import('./nativeFirestoreEntriesRepository')
    ).nativeFirestoreEntriesRepository;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./firestoreEntriesRepository') as typeof import('./firestoreEntriesRepository'))
    .firestoreEntriesRepository;
}

export function getMessagesRepository(): MessagesRepository {
  if (!isFirebaseConfigured) return localMessagesRepository;
  if (shouldUseNativeFirebase()) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./nativeFirestoreMessagesRepository') as typeof import('./nativeFirestoreMessagesRepository')
    ).nativeFirestoreMessagesRepository;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./firestoreMessagesRepository') as typeof import('./firestoreMessagesRepository'))
    .firestoreMessagesRepository;
}

import type { EntriesRepository, MessagesRepository } from './types';
import { localEntriesRepository } from './localEntriesRepository';
import { localMessagesRepository } from './localMessagesRepository';
import { isFirebaseConfigured } from '../firebase/config';

export type { EntriesRepository, MessagesRepository } from './types';

// Firebase 設定時のみ Firestore 実装を読み込む（未設定時は firestore を実行/バンドルしない）。
export function getEntriesRepository(): EntriesRepository {
  if (!isFirebaseConfigured) return localEntriesRepository;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./firestoreEntriesRepository') as typeof import('./firestoreEntriesRepository'))
    .firestoreEntriesRepository;
}

export function getMessagesRepository(): MessagesRepository {
  if (!isFirebaseConfigured) return localMessagesRepository;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./firestoreMessagesRepository') as typeof import('./firestoreMessagesRepository'))
    .firestoreMessagesRepository;
}

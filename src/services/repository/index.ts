import type { EntriesRepository } from './types';
import { localEntriesRepository } from './localEntriesRepository';
import { isFirebaseConfigured } from '../firebase/config';

export type { EntriesRepository } from './types';

// Firebase 設定時のみ Firestore 実装を読み込む（未設定時は firestore を実行/バンドルしない）。
export function getEntriesRepository(): EntriesRepository {
  if (!isFirebaseConfigured) return localEntriesRepository;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./firestoreEntriesRepository') as typeof import('./firestoreEntriesRepository'))
    .firestoreEntriesRepository;
}

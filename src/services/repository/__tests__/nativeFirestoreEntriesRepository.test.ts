import { doc, getDocs, setDoc } from '@react-native-firebase/firestore';

import { nativeFirestoreEntriesRepository } from '../nativeFirestoreEntriesRepository';
import type { DiaryEntry } from '../../../types/diary';

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(() => ({ __col: true })),
  deleteDoc: jest.fn(),
  doc: jest.fn((_col, id) => ({ __doc: true, id })),
  getDocs: jest.fn(),
  getFirestore: jest.fn(() => ({ __db: true })),
  limit: jest.fn((n) => ({ __limit: n })),
  onSnapshot: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  setDoc: jest.fn(),
  where: jest.fn(),
}));

const entry = (overrides: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id: 'new-id',
  date: '2026-07-01',
  mood: 'calm',
  words: [],
  bodyText: '本文',
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  ...overrides,
});

describe('nativeFirestoreEntriesRepository.upsert（1日1件・U-11）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('同一 date の既存ドキュメントが無ければ entry.id で新規作成する', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });

    await nativeFirestoreEntriesRepository.upsert('uid1', entry());

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'new-id');
    const [, savedData] = (setDoc as jest.Mock).mock.calls[0];
    expect(savedData.id).toBeUndefined();
    expect(savedData.createdAt).toBe('2026-07-01T00:00:00Z');
  });

  it('同一 date の既存ドキュメントがあれば既存 id/createdAt を維持して上書きする', async () => {
    (getDocs as jest.Mock).mockResolvedValue({
      docs: [
        {
          id: 'existing-id',
          data: () => ({ createdAt: '2026-06-30T00:00:00Z', date: '2026-07-01' }),
        },
      ],
    });

    await nativeFirestoreEntriesRepository.upsert(
      'uid1',
      entry({ id: 'new-id', bodyText: '更新後の本文', createdAt: '2026-07-01T09:00:00Z' }),
    );

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'existing-id');
    const [, savedData] = (setDoc as jest.Mock).mock.calls[0];
    expect(savedData.id).toBeUndefined();
    expect(savedData.createdAt).toBe('2026-06-30T00:00:00Z');
    expect(savedData.bodyText).toBe('更新後の本文');
  });

  it('既存ドキュメントに createdAt が無い場合は渡された entry.createdAt にフォールバックする', async () => {
    (getDocs as jest.Mock).mockResolvedValue({
      docs: [{ id: 'existing-id', data: () => ({ date: '2026-07-01' }) }],
    });

    await nativeFirestoreEntriesRepository.upsert('uid1', entry({ createdAt: '2026-07-01T09:00:00Z' }));

    const [, savedData] = (setDoc as jest.Mock).mock.calls[0];
    expect(savedData.createdAt).toBe('2026-07-01T09:00:00Z');
  });
});

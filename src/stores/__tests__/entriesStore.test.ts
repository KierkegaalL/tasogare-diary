import { useEntriesStore } from '../entriesStore';
import type { DiaryEntry } from '../../types/diary';

// AsyncStorage をモック（jest が factory を自動で上位へホイストする）。
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const makeEntry = (id: string, date: string): DiaryEntry => ({
  id,
  date,
  mood: 'tender',
  words: [{ text: 'カフェ', category: 'event', source: 'selected' }],
  bodyText: `${id} の本文`,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
});

const store = () => useEntriesStore.getState();

describe('entriesStore', () => {
  beforeEach(() => {
    useEntriesStore.setState({ entries: [] });
  });

  it('addEntry は新しい順に先頭へ追加する', () => {
    store().addEntry(makeEntry('a', '2026-07-01'));
    store().addEntry(makeEntry('b', '2026-07-02'));
    expect(store().entries.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('getEntry は id で取得する', () => {
    store().addEntry(makeEntry('a', '2026-07-01'));
    expect(store().getEntry('a')?.bodyText).toBe('a の本文');
    expect(store().getEntry('zzz')).toBeUndefined();
  });

  it('removeEntry は該当を削除する', () => {
    store().addEntry(makeEntry('a', '2026-07-01'));
    store().addEntry(makeEntry('b', '2026-07-02'));
    store().removeEntry('a');
    expect(store().entries.map((e) => e.id)).toEqual(['b']);
  });

  it('同一 date は upsert（1日1件・U-11）: id/createdAt を維持し本文を更新', () => {
    store().addEntry(makeEntry('a', '2026-07-01'));
    const updated = { ...makeEntry('b', '2026-07-01'), bodyText: '更新後の本文', updatedAt: '2026-07-01T10:00:00Z' };
    store().addEntry(updated);

    expect(store().entries).toHaveLength(1);
    const entry = store().entries[0]!;
    expect(entry.id).toBe('a'); // 既存 id を維持
    expect(entry.createdAt).toBe('2026-07-01T00:00:00Z'); // 既存 createdAt を維持
    expect(entry.bodyText).toBe('更新後の本文'); // 本文は更新
  });
});

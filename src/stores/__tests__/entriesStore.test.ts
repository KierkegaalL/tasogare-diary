import AsyncStorage from '@react-native-async-storage/async-storage';

import { useEntriesStore } from '../entriesStore';
import type { DiaryEntry } from '../../types/diary';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// 自動ID＋date。1日1件は date による upsert で担保。
const makeEntry = (id: string, date: string, body = `${date} の本文`): DiaryEntry => ({
  id,
  date,
  mood: 'tender',
  words: [{ text: 'カフェ', category: 'event', source: 'selected' }],
  bodyText: body,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
});

const store = () => useEntriesStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('entriesStore（リポジトリ層・ローカル）', () => {
  beforeEach(async () => {
    store().teardown();
    await AsyncStorage.clear();
    useEntriesStore.setState({ entries: [], hasHydrated: false });
  });

  it('bootstrap 購読後、addEntry が反映され hasHydrated になる', async () => {
    const uid = 'u1';
    store().bootstrap(uid);
    await store().addEntry(uid, makeEntry('a', '2026-07-01'));
    await flush();
    expect(store().entries.map((e) => e.id)).toContain('a');
    expect(store().hasHydrated).toBe(true);
  });

  it('同一 date は 1件に置き換わり、id/createdAt を維持する（U-11・自動ID＋date）', async () => {
    const uid = 'u1';
    store().bootstrap(uid);
    await store().addEntry(uid, makeEntry('a', '2026-07-01', '古い'));
    await store().addEntry(uid, makeEntry('b', '2026-07-01', '新しい'));
    await flush();
    expect(store().entries).toHaveLength(1);
    expect(store().entries[0]!.id).toBe('a'); // 既存 id を維持
    expect(store().entries[0]!.bodyText).toBe('新しい'); // 本文は更新
  });

  it('removeEntry で削除される', async () => {
    const uid = 'u1';
    store().bootstrap(uid);
    await store().addEntry(uid, makeEntry('a', '2026-07-01'));
    await store().addEntry(uid, makeEntry('b', '2026-07-02'));
    await store().removeEntry(uid, 'a');
    await flush();
    expect(store().entries.map((e) => e.id)).toEqual(['b']);
  });

  it('uid ごとにデータが分離される', async () => {
    await store().addEntry('u1', makeEntry('a', '2026-07-01'));
    store().bootstrap('u2');
    await flush();
    expect(store().entries).toHaveLength(0); // u2 は空
  });
});

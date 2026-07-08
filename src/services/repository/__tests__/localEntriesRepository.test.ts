import AsyncStorage from '@react-native-async-storage/async-storage';

import { localEntriesRepository } from '../localEntriesRepository';
import type { DiaryEntry } from '../../../types/diary';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const entry = (id: string, date: string, body = 'x'): DiaryEntry => ({
  id,
  date,
  mood: 'calm',
  words: [],
  bodyText: body,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('localEntriesRepository', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('subscribe は現在値を通知し、upsert で更新が届く', async () => {
    const uid = 'r1';
    const seen: DiaryEntry[][] = [];
    const unsub = localEntriesRepository.subscribe(uid, (e) => seen.push(e));
    await flush();
    expect(seen[0]).toEqual([]); // 初期は空

    await localEntriesRepository.upsert(uid, entry('a', '2026-07-01'));
    await flush();
    expect(seen[seen.length - 1]?.map((e) => e.id)).toEqual(['a']);
    unsub();
  });

  it('同一 date は id/createdAt 維持で置き換え、remove で消える', async () => {
    const uid = 'r2';
    await localEntriesRepository.upsert(uid, entry('a', '2026-07-01', '旧'));
    await localEntriesRepository.upsert(uid, entry('b', '2026-07-01', '新')); // 同一 date
    await localEntriesRepository.upsert(uid, entry('c', '2026-07-02'));

    const collected: DiaryEntry[][] = [];
    const unsub = localEntriesRepository.subscribe(uid, (e) => collected.push(e));
    await flush();
    const latest = collected[collected.length - 1] ?? [];
    expect(latest).toHaveLength(2);
    const jul1 = latest.find((e) => e.date === '2026-07-01');
    expect(jul1?.id).toBe('a'); // 既存 id を維持
    expect(jul1?.bodyText).toBe('新'); // 本文は更新

    await localEntriesRepository.remove(uid, 'a');
    await flush();
    expect(collected[collected.length - 1]?.map((e) => e.id)).toEqual(['c']);
    unsub();
  });
});

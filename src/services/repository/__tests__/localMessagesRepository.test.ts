import AsyncStorage from '@react-native-async-storage/async-storage';

import { localMessagesRepository } from '../localMessagesRepository';
import type { ChatMessage } from '../../../types/diary';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const msg = (id: string, text: string): ChatMessage => ({
  id,
  role: 'me',
  text,
  createdAt: '2026-07-01T00:00:00Z',
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('localMessagesRepository', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('subscribe は現在値を通知し、add で作成順に届く', async () => {
    const uid = 'r1';
    const entryId = 'e1';
    const seen: ChatMessage[][] = [];
    const unsub = localMessagesRepository.subscribe(uid, entryId, (m) => seen.push(m));
    await flush();
    expect(seen[0]).toEqual([]); // 初期は空

    await localMessagesRepository.add(uid, entryId, msg('m1', 'a'));
    await localMessagesRepository.add(uid, entryId, msg('m2', 'b'));
    await flush();
    expect(seen[seen.length - 1]?.map((m) => m.id)).toEqual(['m1', 'm2']);
    unsub();
  });

  it('remove で該当メッセージが消え、他の entryId とは独立している', async () => {
    const uid = 'r2';
    await localMessagesRepository.add(uid, 'e1', msg('m1', 'a'));
    await localMessagesRepository.add(uid, 'e1', msg('m2', 'b'));
    await localMessagesRepository.add(uid, 'e2', msg('m3', 'c'));

    await localMessagesRepository.remove(uid, 'e1', 'm1');

    const collected: ChatMessage[][] = [];
    const unsub = localMessagesRepository.subscribe(uid, 'e1', (m) => collected.push(m));
    await flush();
    expect(collected[collected.length - 1]?.map((m) => m.id)).toEqual(['m2']);

    const other: ChatMessage[][] = [];
    const unsub2 = localMessagesRepository.subscribe(uid, 'e2', (m) => other.push(m));
    await flush();
    expect(other[other.length - 1]?.map((m) => m.id)).toEqual(['m3']);

    unsub();
    unsub2();
  });
});

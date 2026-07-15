import AsyncStorage from '@react-native-async-storage/async-storage';

import { useMessagesStore } from '../messagesStore';
import type { ChatMessage } from '../../types/diary';

// AsyncStorage をモック（jest が factory を自動で上位へホイストする）。
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const msg = (id: string, role: ChatMessage['role'], text: string): ChatMessage => ({
  id,
  role,
  text,
  createdAt: '2026-07-01T00:00:00Z',
});

const store = () => useMessagesStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('messagesStore（リポジトリ層・ローカル）', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useMessagesStore.setState({ messagesByEntry: {}, hydratedEntries: {} });
  });

  it('bootstrap 購読後、addMessage が順番に反映される', async () => {
    const uid = 'u1';
    const entryId = 'e1';
    store().bootstrap(uid, entryId);
    await store().addMessage(uid, entryId, msg('m1', 'ai', 'こんにちは'));
    await store().addMessage(uid, entryId, msg('m2', 'me', 'うん'));
    await flush();
    expect(store().messagesByEntry[entryId]?.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(store().hydratedEntries[entryId]).toBe(true);
  });

  it('entryId ごとに独立している', async () => {
    store().bootstrap('u1', 'e1');
    store().bootstrap('u1', 'e2');
    await store().addMessage('u1', 'e1', msg('m1', 'ai', 'a'));
    await store().addMessage('u1', 'e2', msg('m2', 'ai', 'b'));
    await flush();
    expect(store().messagesByEntry['e1']).toHaveLength(1);
    expect(store().messagesByEntry['e2']).toHaveLength(1);
  });

  it('removeMessage は該当メッセージを削除する（送信失敗時のロールバック）', async () => {
    const uid = 'u1';
    const entryId = 'e1';
    store().bootstrap(uid, entryId);
    await store().addMessage(uid, entryId, msg('m1', 'ai', 'a'));
    await store().addMessage(uid, entryId, msg('m2', 'me', 'b'));
    await store().removeMessage(uid, entryId, 'm2');
    await flush();
    expect(store().messagesByEntry[entryId]?.map((m) => m.id)).toEqual(['m1']);
  });

  it('teardown は購読解除し、当該 entryId の状態をクリアする', async () => {
    const uid = 'u1';
    const entryId = 'e1';
    store().bootstrap(uid, entryId);
    await store().addMessage(uid, entryId, msg('m1', 'ai', 'a'));
    await flush();
    expect(store().messagesByEntry[entryId]).toHaveLength(1);

    store().teardown(entryId);
    expect(store().messagesByEntry[entryId]).toBeUndefined();
    expect(store().hydratedEntries[entryId]).toBeUndefined();
  });
});

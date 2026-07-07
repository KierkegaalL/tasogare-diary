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

describe('messagesStore', () => {
  beforeEach(() => {
    useMessagesStore.setState({ messagesByEntry: {} });
  });

  it('addMessage はエントリごとに順番に追加する', () => {
    store().addMessage('e1', msg('m1', 'ai', 'こんにちは'));
    store().addMessage('e1', msg('m2', 'me', 'うん'));
    expect(store().getMessages('e1').map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('エントリごとに独立している', () => {
    store().addMessage('e1', msg('m1', 'ai', 'a'));
    store().addMessage('e2', msg('m2', 'ai', 'b'));
    expect(store().getMessages('e1')).toHaveLength(1);
    expect(store().getMessages('e2')).toHaveLength(1);
    expect(store().getMessages('none')).toEqual([]);
  });

  it('removeMessage は該当メッセージを削除する（送信失敗時のロールバック）', () => {
    store().addMessage('e1', msg('m1', 'ai', 'a'));
    store().addMessage('e1', msg('m2', 'me', 'b'));
    store().removeMessage('e1', 'm2');
    expect(store().getMessages('e1').map((m) => m.id)).toEqual(['m1']);
  });
});

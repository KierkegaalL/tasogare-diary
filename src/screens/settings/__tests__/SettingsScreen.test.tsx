import React from 'react';
import { act, create } from 'react-test-renderer';

import { SettingsScreen } from '../SettingsScreen';

// 設定画面（screen.md 3.9）: 「Webで見る」は常時表示。「バックアップする」は連携が実際に
// 可能な場合（useLinkableAccountKinds が非空）のみ表示し、いずれも WebConnect 画面へ遷移する
// （U-13決定: バックアップはApple/Googleアカウント連携で担保。連携UIはWebConnect側にあるため
// そこへ遷移する設計。連携不可環境では「押しても何も起きない」導線を避けるため行自体を隠す）。
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('../../../app/navigation/hooks', () => ({
  useRootNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

const mockUseLinkableAccountKinds = jest.fn();
jest.mock('../../../hooks/useAccountLink', () => ({
  useLinkableAccountKinds: () => mockUseLinkableAccountKinds(),
}));

let mockIsAccountDeletionAvailable = false;
const mockDeleteAccount = jest.fn();
jest.mock('../../../services/account', () => ({
  get isAccountDeletionAvailable() {
    return mockIsAccountDeletionAvailable;
  },
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
}));

const mockSignOut = jest.fn();
jest.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector: (s: { signOut: () => Promise<void> }) => unknown) => selector({ signOut: mockSignOut }),
}));

const mockTeardown = jest.fn();
jest.mock('../../../stores/entriesStore', () => ({
  useEntriesStore: { getState: () => ({ teardown: mockTeardown }) },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

function findPressableByLabel(root: ReturnType<typeof create>, label: string) {
  const text = root.root.find((node) => (node.type as unknown) === 'Text' && node.props.children === label);
  let current: (typeof text)['parent'] = text.parent;
  while (current && typeof current.props.onPress !== 'function') current = current.parent;
  if (!current) throw new Error('onPress を持つ祖先が見つかりません');
  return current;
}

function allTexts(root: ReturnType<typeof create>): string[] {
  return root.root
    .findAllByType('Text' as never)
    .map((n) => n.props.children)
    .filter((c): c is string => typeof c === 'string');
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGoBack.mockReset();
    mockUseLinkableAccountKinds.mockReset();
    mockIsAccountDeletionAvailable = false;
    mockDeleteAccount.mockReset();
    mockSignOut.mockReset();
    mockTeardown.mockReset();
  });

  describe('連携可能（useLinkableAccountKinds が非空）', () => {
    beforeEach(() => {
      mockUseLinkableAccountKinds.mockReturnValue(['apple']);
    });

    it('「Webで見る」「バックアップする」の2行を表示する（サブ文言つき）', () => {
      let root!: ReturnType<typeof create>;
      act(() => {
        root = create(<SettingsScreen />);
      });

      const texts = allTexts(root);
      expect(texts).toContain('Webで見る');
      expect(texts).toContain('パソコンから日記を見られるようにする');
      expect(texts).toContain('バックアップする');
      expect(texts).toContain('機種変更・削除に備えてアカウントを保存');
      act(() => root.unmount());
    });

    it('「Webで見る」を押すと WebConnect へ遷移する', () => {
      let root!: ReturnType<typeof create>;
      act(() => {
        root = create(<SettingsScreen />);
      });

      act(() => {
        findPressableByLabel(root, 'Webで見る').props.onPress();
      });

      expect(mockNavigate).toHaveBeenCalledWith('WebConnect');
      act(() => root.unmount());
    });

    it('「バックアップする」を押すと WebConnect へ遷移する（連携UIの重複実装を避けるため）', () => {
      let root!: ReturnType<typeof create>;
      act(() => {
        root = create(<SettingsScreen />);
      });

      act(() => {
        findPressableByLabel(root, 'バックアップする').props.onPress();
      });

      expect(mockNavigate).toHaveBeenCalledWith('WebConnect');
      act(() => root.unmount());
    });

    it('行に読み上げ用の accessibilityLabel を付与する', () => {
      let root!: ReturnType<typeof create>;
      act(() => {
        root = create(<SettingsScreen />);
      });

      const row = findPressableByLabel(root, 'バックアップする');
      expect(row.props.accessibilityLabel).toBe('バックアップする。機種変更・削除に備えてアカウントを保存');
      act(() => root.unmount());
    });
  });

  describe('連携不可（useLinkableAccountKinds が空）', () => {
    beforeEach(() => {
      mockUseLinkableAccountKinds.mockReturnValue([]);
    });

    it('「バックアップする」行を表示しない（押しても何も起きない導線を避ける）', () => {
      let root!: ReturnType<typeof create>;
      act(() => {
        root = create(<SettingsScreen />);
      });

      const texts = allTexts(root);
      expect(texts).toContain('Webで見る');
      expect(texts).not.toContain('バックアップする');
      act(() => root.unmount());
    });
  });

  describe('アカウント削除（data.md 第7章）', () => {
    beforeEach(() => {
      mockUseLinkableAccountKinds.mockReturnValue([]);
    });

    it('isAccountDeletionAvailable=false のときは削除行を表示しない（Worker未設定時は削除できたふりをしない）', () => {
      mockIsAccountDeletionAvailable = false;
      let root!: ReturnType<typeof create>;
      act(() => {
        root = create(<SettingsScreen />);
      });

      expect(allTexts(root)).not.toContain('アカウントを削除する');
      act(() => root.unmount());
    });

    it('削除行を押すと確認UIを表示し、まだ削除は実行しない', () => {
      mockIsAccountDeletionAvailable = true;
      let root!: ReturnType<typeof create>;
      act(() => {
        root = create(<SettingsScreen />);
      });

      act(() => {
        findPressableByLabel(root, 'アカウントを削除する').props.onPress();
      });

      expect(allTexts(root)).toContain('本当に削除しますか？この操作は取り消せません。日記・対話・連携情報がすべて削除されます。');
      expect(mockDeleteAccount).not.toHaveBeenCalled();
      act(() => root.unmount());
    });

    it('確認後に「本当に削除する」を押すと deleteAccount→entriesStore即時クリア→signOut→Homeへの遷移を行う', async () => {
      mockIsAccountDeletionAvailable = true;
      mockDeleteAccount.mockResolvedValue({ deleted: true });
      mockSignOut.mockResolvedValue(undefined);
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });

      await act(async () => {
        findPressableByLabel(root, 'アカウントを削除する').props.onPress();
      });
      await act(async () => {
        await findPressableByLabel(root, '本当に削除する').props.onPress();
      });

      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
      // 旧uidの日記が新セッション確立までの一瞬でも残留表示されないよう、
      // signOut（新しい匿名セッション確立）より前に teardown で購読を止める。
      expect(mockTeardown).toHaveBeenCalledTimes(1);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      const teardownOrder = mockTeardown.mock.invocationCallOrder[0]!;
      const signOutOrder = mockSignOut.mock.invocationCallOrder[0]!;
      expect(teardownOrder).toBeLessThan(signOutOrder);
      expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'Home' });
      act(() => root.unmount());
    });

    it('deleteAccountは成功したがsignOut（再匿名化）が失敗した場合、「削除に失敗」とは表示せず遷移もしない', async () => {
      // 削除自体は完了済みのため、authStore.signOut失敗をdeleteAccount失敗と誤表示しない
      // （reviewer指摘）。この場合 authStore.status が 'error' になり App.tsx がアプリ全体を
      // 再起動案内画面へ切り替える設計のため、本コンポーネントは busy を戻すのみで良い。
      mockIsAccountDeletionAvailable = true;
      mockDeleteAccount.mockResolvedValue({ deleted: true });
      mockSignOut.mockRejectedValue(new Error('re-auth failed'));
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });

      await act(async () => {
        findPressableByLabel(root, 'アカウントを削除する').props.onPress();
      });
      await act(async () => {
        await findPressableByLabel(root, '本当に削除する').props.onPress();
      });

      expect(mockTeardown).toHaveBeenCalledTimes(1);
      expect(allTexts(root)).not.toContain('削除に失敗しました。もう一度お試しください。');
      expect(mockNavigate).not.toHaveBeenCalled();
      act(() => root.unmount());
    });

    it('削除に失敗した場合はエラーを表示し、確認UIのまま再試行できる（entriesStoreは触らない）', async () => {
      mockIsAccountDeletionAvailable = true;
      mockDeleteAccount.mockRejectedValue(new Error('network'));
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });

      await act(async () => {
        findPressableByLabel(root, 'アカウントを削除する').props.onPress();
      });
      await act(async () => {
        await findPressableByLabel(root, '本当に削除する').props.onPress();
      });

      expect(allTexts(root)).toContain('削除に失敗しました。もう一度お試しください。');
      expect(mockTeardown).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      // 確認UIのまま（キャンセルボタンが引き続き見える）で再試行できる。
      expect(allTexts(root)).toContain('キャンセル');
      act(() => root.unmount());
    });

    it('「キャンセル」を押すと確認UIを閉じ、削除行に戻る', () => {
      mockIsAccountDeletionAvailable = true;
      let root!: ReturnType<typeof create>;
      act(() => {
        root = create(<SettingsScreen />);
      });

      act(() => {
        findPressableByLabel(root, 'アカウントを削除する').props.onPress();
      });
      act(() => {
        findPressableByLabel(root, 'キャンセル').props.onPress();
      });

      expect(allTexts(root)).toContain('アカウントを削除する');
      expect(allTexts(root)).not.toContain('本当に削除しますか？この操作は取り消せません。日記・対話・連携情報がすべて削除されます。');
      act(() => root.unmount());
    });
  });
});

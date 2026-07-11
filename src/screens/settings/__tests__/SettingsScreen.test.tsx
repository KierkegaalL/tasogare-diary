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
});

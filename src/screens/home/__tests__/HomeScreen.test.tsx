import React from 'react';
import { act, create } from 'react-test-renderer';

import { HomeScreen } from '../HomeScreen';

// 依存はすべてモックし、「日記を書く」ボタンの活性/非活性ロジックだけを検証する。
const mockNavigate = jest.fn();
jest.mock('../../../app/navigation/hooks', () => ({
  useRootNavigation: () => ({ navigate: mockNavigate }),
}));

let mockEntries: unknown[] = [];
let mockEntriesHydrated = true;
jest.mock('../../../stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: { entries: unknown[]; hasHydrated: boolean }) => unknown) =>
    selector({ entries: mockEntries, hasHydrated: mockEntriesHydrated }),
}));

let mockDraftHydrated = true;
jest.mock('../../../stores/draftStore', () => ({
  useDraftStore: (selector: (s: { hasHydrated: boolean }) => unknown) =>
    selector({ hasHydrated: mockDraftHydrated }),
}));

jest.mock('../../../components/Orb', () => ({ Orb: () => null }));
jest.mock('../../../components/OrbMini', () => ({ OrbMini: () => null }));
jest.mock('../../../components/EntryCard', () => ({ EntryCard: () => null }));

function findCta(root: ReturnType<typeof create>) {
  const matches = root.root.findAll(
    (n) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel !== '設定',
  );
  const cta = matches[0];
  if (!cta) throw new Error('CTA button not found');
  return cta;
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockEntries = [];
    mockEntriesHydrated = true;
    mockDraftHydrated = true;
  });

  it('draftStore のリハイドレート完了前は「日記を書く」を無効化する', async () => {
    mockDraftHydrated = false;
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<HomeScreen />);
    });

    expect(findCta(root).props.accessibilityState).toEqual({ disabled: true });
  });

  it('draftStore のリハイドレート完了後は「日記を書く」を有効化し、押すと DiaryFlow へ遷移する', async () => {
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<HomeScreen />);
    });

    const cta = findCta(root);
    expect(cta.props.accessibilityState).toEqual({ disabled: false });

    await act(async () => {
      cta.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('DiaryFlow', { screen: 'Mood' });
  });
});

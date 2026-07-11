import React from 'react';
import { SectionList, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';

import { CalendarScreen } from '../CalendarScreen';
import type { DiaryEntry } from '../../../types/diary';

// 過去の日記一覧（リストモード）の SectionList 化（constraints.md: 仮想化）を検証する。
// 依存はすべてモックし、CalendarScreen のロジックだけを見る。
jest.mock('../../../services/diaryApi', () => ({
  generateInsight: jest.fn().mockRejectedValue(new Error('no-entries')),
}));

let mockEntries: DiaryEntry[] = [];
jest.mock('../../../stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: { entries: DiaryEntry[]; hasHydrated: boolean }) => unknown) =>
    selector({ entries: mockEntries, hasHydrated: true }),
}));

const mockNavigate = jest.fn();
jest.mock('../../../app/navigation/hooks', () => ({
  useRootNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

jest.mock('../../../components/OrbMini', () => ({ OrbMini: () => null }));

function entry(id: string, date: string, bodyText: string, words: { text: string }[] = []): DiaryEntry {
  return {
    id,
    date,
    mood: 'calm',
    words: words.map((w) => ({ ...w, category: 'assoc', source: 'selected' })),
    bodyText,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  } as DiaryEntry;
}

// テキストのインスタンスから、onPress を持つ祖先（Pressable）まで遡る。
function findPressableAncestor(node: ReturnType<typeof create>['root']) {
  let current: (typeof node)['parent'] = node.parent;
  while (current && typeof current.props.onPress !== 'function') current = current.parent;
  if (!current) throw new Error('onPress を持つ祖先が見つかりません');
  return current;
}

// SectionList/VirtualizedList は内部に循環参照を持つため toJSON()+JSON.stringify は使えない。
// 代わりに全 Text ノードの children を平坦なテキスト配列として集める。
function allTexts(root: ReturnType<typeof create>): string[] {
  return root.root
    .findAllByType('Text' as never)
    .flatMap((node) => (Array.isArray(node.props.children) ? node.props.children : [node.props.children]))
    .filter((c): c is string => typeof c === 'string');
}

// 指定のテキストを直接の children に持つ Text ノードを1つ探す。
function findTextNode(root: ReturnType<typeof create>, text: string) {
  return root.root.find((node) => (node.type as unknown) === 'Text' && node.props.children === text);
}

async function renderInListMode() {
  let root!: ReturnType<typeof create>;
  await act(async () => {
    root = create(<CalendarScreen />);
  });
  // 「リスト」タブへ切り替える。
  const listTabText = findTextNode(root, 'リスト');
  const listTab = findPressableAncestor(listTabText);
  await act(async () => {
    listTab.props.onPress();
  });
  return root;
}

describe('CalendarScreen のリスト表示（SectionList）', () => {
  beforeEach(() => {
    mockEntries = [];
    mockNavigate.mockReset();
  });

  it('日記が1件も無ければ空状態メッセージを表示する', async () => {
    const root = await renderInListMode();
    expect(allTexts(root)).toContain('まだ日記がありません。');
    await act(async () => root.unmount());
  });

  it('日記を月ごとの見出し付きで表示する', async () => {
    mockEntries = [entry('e1', '2026-07-01', '七月の本文'), entry('e2', '2026-06-15', '六月の本文')];
    const root = await renderInListMode();
    const texts = allTexts(root);

    expect(texts).toContain('2026年7月');
    expect(texts).toContain('2026年6月');
    expect(texts).toContain('七月の本文');
    expect(texts).toContain('六月の本文');
    await act(async () => root.unmount());
  });

  it('SectionList（仮想化リスト）で描画する', async () => {
    mockEntries = [entry('e1', '2026-07-01', '本文')];
    const root = await renderInListMode();
    expect(root.root.findAllByType(SectionList).length).toBe(1);
    await act(async () => root.unmount());
  });

  it('検索語で本文/選択語を絞り込む', async () => {
    mockEntries = [
      entry('e1', '2026-07-01', 'カフェで過ごした', [{ text: '疲れた' }]),
      entry('e2', '2026-07-02', '家でゆっくりした', [{ text: '穏やか' }]),
    ];
    const root = await renderInListMode();
    const input = root.root.findByType(TextInput);

    await act(async () => {
      input.props.onChangeText('疲れた');
    });

    const texts = allTexts(root);
    expect(texts).toContain('カフェで過ごした');
    expect(texts).not.toContain('家でゆっくりした');
    await act(async () => root.unmount());
  });

  it('該当する日記が無ければその旨を表示する', async () => {
    mockEntries = [entry('e1', '2026-07-01', 'カフェで過ごした')];
    const root = await renderInListMode();
    const input = root.root.findByType(TextInput);

    await act(async () => {
      input.props.onChangeText('存在しない語');
    });

    expect(allTexts(root)).toContain('該当する日記がありません。');
    await act(async () => root.unmount());
  });

  it('エントリを押すと Detail へ遷移する', async () => {
    mockEntries = [entry('e1', '2026-07-01', 'カフェで過ごした')];
    const root = await renderInListMode();

    const entryText = findTextNode(root, 'カフェで過ごした');
    const entryRow = findPressableAncestor(entryText);
    await act(async () => {
      entryRow.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Detail', { entryId: 'e1' });
    await act(async () => root.unmount());
  });
});

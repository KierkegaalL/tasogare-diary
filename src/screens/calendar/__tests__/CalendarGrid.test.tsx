import React from 'react';
import { act, create } from 'react-test-renderer';

import { CalendarScreen } from '../CalendarScreen';
import type { DiaryEntry } from '../../../types/diary';

// カレンダー月表示のグリッド構造を検証する（Issue #60: iOS実機で日曜日の欄に日付が
// 表示されない不具合の回帰テスト）。原因は 100/7% の丸め誤差により flexWrap が
// 最終列（日曜）を次行へ折り返してしまうことだったため、週ごとの行を明示的に
// 描画する構造（flexWrap に依存しない）へ変更した。react-test-renderer は実際の
// レイアウト計算（Yoga）を行わないため丸め誤差そのものは再現できないが、
// 「日曜列（各週行の7番目の子要素）に実際の日付セルが描画され、7列が常に維持される」
// という構造上の不変条件を検証する。
//
// 2026年5月は31日（月曜始まりグリッドの最終行・7列目＝日曜日）で、月内の日曜日は
// 3, 10, 17, 24, 31（`node -e` で getDay() を確認済み）。
jest.mock('../../../services/diaryApi', () => ({
  generateInsight: jest.fn().mockRejectedValue(new Error('no-entries')),
}));

jest.mock('../../../stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: { entries: DiaryEntry[]; hasHydrated: boolean }) => unknown) =>
    selector({ entries: [], hasHydrated: true }),
}));

jest.mock('../../../app/navigation/hooks', () => ({
  useRootNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View: RNView } = jest.requireActual('react-native');
  return { SafeAreaView: RNView };
});

jest.mock('../../../components/OrbMini', () => ({ OrbMini: () => null }));

function allTexts(root: ReturnType<typeof create>): string[] {
  return root.root
    .findAllByType('Text' as never)
    .flatMap((node) =>
      Array.isArray(node.props.children) ? node.props.children : [node.props.children],
    )
    .filter((c): c is string | number => typeof c === 'string' || typeof c === 'number')
    .map((c) => String(c));
}

const SUNDAYS_IN_MAY_2026 = ['2026-05-03', '2026-05-10', '2026-05-17', '2026-05-24', '2026-05-31'];

describe('CalendarScreen の月表示グリッド（Issue #60 回帰テスト）', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('日曜日（月内の全5回、月末31日を含む）が各週行の7番目のセルとして欠けずに描画される', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    jest.setSystemTime(new Date(2026, 4, 15, 12, 0, 0)); // 2026-05-15

    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<CalendarScreen />);
    });

    expect(allTexts(root)).toContain('2026年5月');

    // 各週行（testID="calendar-week-N"）は常にちょうど7セル
    // （flexWrap に頼らない明示的な行構造のため、丸め誤差で列が欠けることがない）。
    const weekRows = root.root.findAll(
      (node) =>
        (node.type as unknown) === 'View' &&
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('calendar-week-'),
    );
    expect(weekRows.length).toBeGreaterThan(0);
    for (const row of weekRows) {
      expect(row.children.length).toBe(7);
      // 7番目（index6）＝日曜列は、空白セルか実データセルのいずれかで必ず埋まっている。
      const sundayCell = row.children[6];
      expect(sundayCell).toBeTruthy();
    }

    // 月内の日曜日すべてが、対応する日付セル（testID="calendar-cell-<iso>"）として実在し、
    // その中に日付テキストを持つことを検証する（＝日曜列で描画が欠落していない）。
    for (const iso of SUNDAYS_IN_MAY_2026) {
      const cell = root.root.findByProps({ testID: `calendar-cell-${iso}` });
      const day = String(Number(iso.split('-')[2]));
      const cellTexts = cell
        .findAllByType('Text' as never)
        .flatMap((node) =>
          Array.isArray(node.props.children) ? node.props.children : [node.props.children],
        )
        .map((c) => String(c));
      expect(cellTexts).toContain(day);

      // そのセルが、実際に自身の週行の7番目（日曜列）に位置していることも確認する。
      const parentRow = cell.parent;
      expect(parentRow).toBeTruthy();
      const indexInRow = parentRow?.children.indexOf(cell);
      expect(indexInRow).toBe(6);
    }

    await act(async () => root.unmount());
  });
});

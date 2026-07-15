import React from 'react';
import { act, create } from 'react-test-renderer';

import { CalendarScreen } from '../CalendarScreen';
import type { DiaryEntry } from '../../../types/diary';

// 週次インサイトカード（screen.md 3.7）の呼び出し条件と失敗時の挙動を検証する。
// 依存はすべてモックし、CalendarScreen のロジックだけを見る。
const mockGenerateInsight = jest.fn();
jest.mock('../../../services/diaryApi', () => ({
  generateInsight: (...args: unknown[]) => mockGenerateInsight(...args),
}));

let mockEntries: DiaryEntry[] = [];
jest.mock('../../../stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: { entries: DiaryEntry[]; hasHydrated: boolean }) => unknown) =>
    selector({ entries: mockEntries, hasHydrated: true }),
}));

jest.mock('../../../app/navigation/hooks', () => ({
  useRootNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

jest.mock('../../../components/OrbMini', () => ({ OrbMini: () => null }));

function entry(id: string): DiaryEntry {
  return {
    id,
    date: '2026-07-01',
    mood: 'calm',
    words: [],
    bodyText: '本文',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  } as DiaryEntry;
}

const insightResponse = {
  type: 'weekly' as const,
  periodKey: '2026-W27',
  rangeStart: '2026-06-29',
  rangeEnd: '2026-07-05',
  moodDistribution: { calm: 100, tender: 0, heavy: 0 },
  topWords: [{ word: '雨', count: 2 }],
  narrative: '今週のまとめ',
  generatedAt: '2026-07-05T00:00:00.000Z',
  schemaVersion: 1,
};

async function render() {
  let root!: ReturnType<typeof create>;
  await act(async () => {
    root = create(<CalendarScreen />);
  });
  await act(async () => {
    jest.advanceTimersByTime(0);
  });
  return root;
}

describe('CalendarScreen の週次インサイト', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGenerateInsight.mockReset().mockResolvedValue(insightResponse);
    mockEntries = [];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('日記が1件も無ければ generateInsight を呼ばない', async () => {
    const root = await render();
    expect(mockGenerateInsight).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('日記があれば今週分（weekly）を1回だけ取得する', async () => {
    mockEntries = [entry('e1')];
    const root = await render();

    expect(mockGenerateInsight).toHaveBeenCalledTimes(1);
    const req = mockGenerateInsight.mock.calls[0][0];
    expect(req.type).toBe('weekly');
    expect(req.periodKey).toMatch(/^\d{4}-W\d{2}$/);
    await act(async () => root.unmount());
  });

  it('取得成功時は narrative を表示する', async () => {
    mockEntries = [entry('e1')];
    const root = await render();

    const texts = root.root.findAllByType('Text' as never);
    const rendered = JSON.stringify(root.toJSON());
    expect(texts.length).toBeGreaterThan(0);
    expect(rendered).toContain('今週のまとめ');
    expect(rendered).toContain('今週の傾向');
    await act(async () => root.unmount());
  });

  it('失敗時（今週まだ日記が無い/オフライン等）はカードを出さない', async () => {
    mockEntries = [entry('e1')];
    mockGenerateInsight.mockRejectedValue(new Error('failed-precondition'));
    const root = await render();

    expect(JSON.stringify(root.toJSON())).not.toContain('今週の傾向');
    await act(async () => root.unmount());
  });

  it('アンマウント後に取得は走らない', async () => {
    mockEntries = [entry('e1')];
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<CalendarScreen />);
    });
    await act(async () => root.unmount());
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockGenerateInsight).not.toHaveBeenCalled();
  });

  it('取得の応答前にアンマウントされても setState しない（警告を出さない）', async () => {
    mockEntries = [entry('e1')];
    let resolve!: (v: unknown) => void;
    mockGenerateInsight.mockReturnValue(new Promise((r) => { resolve = r; }));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const root = await render();
    expect(mockGenerateInsight).toHaveBeenCalledTimes(1);

    // 応答が返る前にアンマウント → その後に解決させる。
    await act(async () => root.unmount());
    await act(async () => {
      resolve(insightResponse);
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

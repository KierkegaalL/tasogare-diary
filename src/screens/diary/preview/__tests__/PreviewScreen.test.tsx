import React from 'react';
import { act, create } from 'react-test-renderer';

import { PreviewScreen } from '../PreviewScreen';

// 保存フロー（オフライン・タイムアウト時のハング防止）: Firestore は永続化未設定
// （RN では IndexedDB 不在。architecture.md 第7章）のため、オフライン中の書き込み Promise は
// オンライン復帰まで解決しない。ここでは「保存中…」のまま無期限にハングしないことを検証する。

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('../../../../app/navigation/hooks', () => ({
  useDiaryFlowNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

// react-native-reanimated（worklets ネイティブモジュール）は jest 環境で読み込めないため、
// これらに依存するコンポーネントはモックする（HomeScreen.test.tsx と同じ方針）。
jest.mock('../../../../components/Orb', () => ({ Orb: () => null }));
jest.mock('../../../../components/LitOverlay', () => ({ LitOverlay: () => null }));

const mockReset = jest.fn();
jest.mock('../../../../stores/draftStore', () => ({
  useDraftStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ mood: 'calm', words: [], awareness: null, reset: mockReset }),
}));

const mockAddEntry = jest.fn();
jest.mock('../../../../stores/entriesStore', () => ({
  useEntriesStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addEntry: (...args: unknown[]) => mockAddEntry(...args) }),
}));

jest.mock('../../../../stores/authStore', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) => selector({ user: { uid: 'u1' } }),
}));

let mockConnected: boolean | null = true;
jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({ isConnected: mockConnected }),
}));

const mockRefetch = jest.fn();
jest.mock('../../../../hooks/useDiaryGeneration', () => ({
  useGenerateDiary: () => ({
    data: { bodyText: '穏やかな一日でした', mood: 'calm', promptVersion: 'v1', model: 'm' },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: mockRefetch,
  }),
  useAdjustDiary: () => ({ mutate: jest.fn(), isPending: false }),
}));

function findByText(root: ReturnType<typeof create>, text: string) {
  return root.root.findAll((node) => (node.type as unknown) === 'Text' && node.props.children === text);
}

function findPressableByLabel(root: ReturnType<typeof create>, label: string) {
  const text = root.root.find((node) => (node.type as unknown) === 'Text' && node.props.children === label);
  let current: (typeof text)['parent'] = text.parent;
  while (current && typeof current.props.onPress !== 'function') current = current.parent;
  if (!current) throw new Error('onPress を持つ祖先が見つかりません');
  return current;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('PreviewScreen 保存フロー', () => {
  beforeEach(() => {
    mockConnected = true;
    mockAddEntry.mockReset();
    mockReset.mockReset();
  });

  it('オフライン時は保存ボタンが無効化され、案内文が表示され、保存は呼ばれない', async () => {
    mockConnected = false;
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PreviewScreen />);
    });
    await flush();

    expect(findByText(root, 'オフラインのため保存できません。下書きは保持されています。オンラインになってからお試しください。').length).toBe(1);
    const button = findPressableByLabel(root, '保存する');
    expect(button.props.disabled).toBe(true);

    await act(async () => {
      button.props.onPress();
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('保存中に応答がタイムアウトすると、ハングせずタイムアウトのエラー表示に倒れる', async () => {
    jest.useFakeTimers();
    mockAddEntry.mockImplementation(() => new Promise(() => {})); // 意図的に解決しない
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PreviewScreen />);
    });
    await flush();

    const button = findPressableByLabel(root, '保存する');
    await act(async () => {
      button.props.onPress();
    });
    expect(mockAddEntry).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(15000);
      await Promise.resolve();
    });

    expect(
      findByText(
        root,
        '通信状態が不安定で保存に時間がかかっています。下書きは保持されています。オンラインになってからもう一度お試しください。',
      ).length,
    ).toBe(1);
    expect(mockReset).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    jest.useRealTimers();
  });

  it('タイムアウト後も前回の書き込みが未決着の間は、もう一度保存するを押しても再送しない（1日1件の重複保存防止）', async () => {
    jest.useFakeTimers();
    let resolveFirstWrite!: () => void;
    mockAddEntry.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstWrite = resolve;
        }),
    );
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PreviewScreen />);
    });
    await flush();

    await act(async () => {
      findPressableByLabel(root, '保存する').props.onPress();
    });
    expect(mockAddEntry).toHaveBeenCalledTimes(1);

    // 15秒経過→UI上はタイムアウト扱いのラベルになるが、前回の書き込みが未決着の間は
    // writeInFlight によりボタンは無効化されたまま（＝押しても再送されない）。
    await act(async () => {
      jest.advanceTimersByTime(15000);
      await Promise.resolve();
    });
    let retryButton = findPressableByLabel(root, 'もう一度保存する');
    expect(retryButton.props.disabled).toBe(true);

    await act(async () => {
      retryButton.props.onPress();
    });
    expect(mockAddEntry).toHaveBeenCalledTimes(1);

    // 前回の書き込みがようやく解決すると、ボタンが再度活性化し、以後は再送できるようになる。
    mockAddEntry.mockResolvedValueOnce(undefined);
    await act(async () => {
      resolveFirstWrite();
      await Promise.resolve();
    });
    retryButton = findPressableByLabel(root, 'もう一度保存する');
    expect(retryButton.props.disabled).toBeFalsy();
    await act(async () => {
      retryButton.props.onPress();
    });
    expect(mockAddEntry).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
    jest.useRealTimers();
  });

  it('保存待ち（タイムアウト前）にアンマウントされても、後続の状態更新でエラーにならない', async () => {
    jest.useFakeTimers();
    mockAddEntry.mockImplementation(() => new Promise(() => {}));
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PreviewScreen />);
    });
    await flush();

    await act(async () => {
      findPressableByLabel(root, '保存する').props.onPress();
    });
    expect(mockAddEntry).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });

    // アンマウント後にタイムアウトが発火しても setState が起きない（isMountedRef ガード）ことを確認する。
    expect(() => {
      act(() => {
        jest.advanceTimersByTime(15000);
      });
    }).not.toThrow();

    jest.useRealTimers();
  });
});

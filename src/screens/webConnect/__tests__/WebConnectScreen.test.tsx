import React from 'react';
import { act, create } from 'react-test-renderer';

import { WebConnectScreen } from '../WebConnectScreen';

// 依存はすべてモックし、画面のタイマー/分岐ロジックだけを検証する
// （firebase を読み込む pairing サービス、QR/ネット/ナビも実 import を避ける）。
const mockCreatePairingToken = jest.fn();
let mockPairingAvailable = true;
jest.mock('../../../services/pairing', () => ({
  createPairingToken: (...args: unknown[]) => mockCreatePairingToken(...args),
  get isPairingAvailable() {
    return mockPairingAvailable;
  },
  pairingQrPayload: (t: string) => `payload:${t}`,
}));

let mockConnected: boolean | null = true;
jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({ isConnected: mockConnected }),
}));

jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../../app/navigation/hooks', () => ({
  useRootNavigation: () => ({ goBack: jest.fn() }),
}));

const flush = () => act(async () => {});

function tokenResponse(token = 'tok-1') {
  return { token, expiresAt: new Date(Date.now() + 60_000).toISOString(), ttlSeconds: 60 };
}

describe('WebConnectScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCreatePairingToken.mockReset().mockResolvedValue(tokenResponse());
    mockPairingAvailable = true;
    mockConnected = true;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('オンライン/利用可能時、マウント後にトークンを発行する', async () => {
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<WebConnectScreen />);
    });
    // 初回発行は setTimeout(0) に逃がしているためタイマーを進める。
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await flush();

    expect(mockCreatePairingToken).toHaveBeenCalledTimes(1);
    await act(async () => {
      root.unmount();
    });
  });

  it('オフライン時はトークンを発行しない', async () => {
    mockConnected = false;
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<WebConnectScreen />);
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(mockCreatePairingToken).not.toHaveBeenCalled();
    await act(async () => {
      root.unmount();
    });
  });

  it('ペアリング未対応（サーバ未設定）時はトークンを発行しない', async () => {
    mockPairingAvailable = false;
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<WebConnectScreen />);
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(mockCreatePairingToken).not.toHaveBeenCalled();
    await act(async () => {
      root.unmount();
    });
  });

  it('60秒経過で自動的に再発行する', async () => {
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<WebConnectScreen />);
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await flush();
    expect(mockCreatePairingToken).toHaveBeenCalledTimes(1);

    // カウントダウン 60 秒経過 → 再発行。
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(mockCreatePairingToken).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  it('アンマウント後はタイマーが残らない（再発行が走らない）', async () => {
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<WebConnectScreen />);
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await flush();
    expect(mockCreatePairingToken).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    // アンマウント後に時間を進めても再発行は起きない。
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(mockCreatePairingToken).toHaveBeenCalledTimes(1);
  });
});

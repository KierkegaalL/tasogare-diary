import React from 'react';
import { Platform, Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import { SettingsScreen } from '../SettingsScreen';

// 設定画面（screen.md 3.9/3.10統合）: 「Webで見る」（QR）と「バックアップする」（Apple/Google連携、
// U-13決定）は個別行→別画面遷移ではなく、設定画面に直接埋め込む（両方が同じ画面に着地し利用者に
// 区別が伝わらなかった旧構成をユーザー指摘により撤廃）。アカウント削除はその下に配置する。
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('../../../app/navigation/hooks', () => ({
  useRootNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

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

// WebAccountRow は Firebase 未設定時（テスト環境では実際の環境変数が無いため既定 false）は
// 導線自体を出さない（reviewer指摘）ため、Web版のテストでは true に切り替える。
let mockIsFirebaseConfigured = false;
jest.mock('../../../services/firebase/config', () => ({
  get isFirebaseConfigured() {
    return mockIsFirebaseConfigured;
  },
}));

jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../../services/auth', () => ({
  linkKindLabel: (k: string) => (k === 'google' ? 'Google' : 'Apple'),
  AuthLinkError: class extends Error {},
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
const mockLinkAccount = jest.fn();
const mockRequestWebConnect = jest.fn();
let mockAuthUser: { uid: string; provider: string; isAnonymous?: boolean } | null = null;
jest.mock('../../../stores/authStore', () => ({
  useAuthStore: (
    selector: (s: {
      user: unknown;
      signOut: () => Promise<void>;
      linkAccount: (k: string) => Promise<void>;
      requestWebConnect: () => Promise<void>;
    }) => unknown,
  ) =>
    selector({
      user: mockAuthUser,
      signOut: mockSignOut,
      linkAccount: mockLinkAccount,
      requestWebConnect: mockRequestWebConnect,
    }),
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
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((c): c is string => typeof c === 'string');
}

function tokenResponse(token = 'tok-1') {
  return { token, expiresAt: new Date(Date.now() + 60_000).toISOString(), ttlSeconds: 60 };
}

const flush = () => act(async () => {});

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockNavigate.mockReset();
    mockGoBack.mockReset();
    mockCreatePairingToken.mockReset().mockResolvedValue(tokenResponse());
    mockPairingAvailable = true;
    mockConnected = true;
    mockUseLinkableAccountKinds.mockReset().mockReturnValue([]);
    mockIsAccountDeletionAvailable = false;
    mockDeleteAccount.mockReset();
    mockSignOut.mockReset();
    mockLinkAccount.mockReset();
    mockTeardown.mockReset();
    mockRequestWebConnect.mockReset();
    mockAuthUser = null;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Webで見る（QR）', () => {
    it('オンライン/利用可能時、マウント後にトークンを発行する', async () => {
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
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
        root = create(<SettingsScreen />);
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
        root = create(<SettingsScreen />);
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
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();
      expect(mockCreatePairingToken).toHaveBeenCalledTimes(1);

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
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();
      expect(mockCreatePairingToken).toHaveBeenCalledTimes(1);

      await act(async () => {
        root.unmount();
      });
      await act(async () => {
        jest.advanceTimersByTime(120_000);
      });
      expect(mockCreatePairingToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('Web版（Expo Web でこの画面自体をブラウザ表示した場合）', () => {
    const originalOS = Platform.OS;
    const originalWebUrl = process.env.EXPO_PUBLIC_WEB_URL;

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { get: () => originalOS });
      process.env.EXPO_PUBLIC_WEB_URL = originalWebUrl;
      mockIsFirebaseConfigured = false;
    });

    it('PC向けQRコードは表示せず、Webダッシュボードへの案内を表示する（トークンも発行しない）', async () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'web' });
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();

      expect(mockCreatePairingToken).not.toHaveBeenCalled();
      expect(allTexts(root).join('|')).toContain('分析・検索など、より詳しく見るならWebダッシュボード');
      await act(async () => {
        root.unmount();
      });
    });

    it('EXPO_PUBLIC_WEB_URL 設定時はダッシュボードへ遷移するボタンを表示する', async () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'web' });
      process.env.EXPO_PUBLIC_WEB_URL = 'https://tasogare-diary.app';
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();

      const button = findPressableByLabel(root, 'Webダッシュボードを開く');
      expect(typeof button.props.onPress).toBe('function');
      await act(async () => {
        root.unmount();
      });
    });

    it('副題がWebダッシュボード向けの文言になり、スマホ向けの注記は表示しない', async () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'web' });
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();

      const texts = allTexts(root).join('|');
      expect(texts).toContain('Webダッシュボードへの案内');
      expect(texts).not.toContain('Web連携・バックアップ');
      expect(texts).not.toContain('スマホの日記データはそのまま、安全に保たれます');
      await act(async () => {
        root.unmount();
      });
    });

    it('匿名セッションなら「スマホと連携する」を表示し、押すと requestWebConnect を呼ぶ', async () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'web' });
      mockIsFirebaseConfigured = true;
      mockAuthUser = { uid: 'guest-1', provider: 'anonymous', isAnonymous: true };
      mockRequestWebConnect.mockResolvedValue(undefined);
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();

      const texts = allTexts(root).join('|');
      expect(texts).toContain('スマホと連携する');
      expect(texts).not.toContain('ログアウトする');

      await act(async () => {
        findPressableByLabel(root, 'スマホと連携する').props.onPress();
      });
      expect(mockRequestWebConnect).toHaveBeenCalledTimes(1);
      await act(async () => {
        root.unmount();
      });
    });

    it('連携する行を連打しても requestWebConnect は1回しか呼ばれない（busyガード）', async () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'web' });
      mockIsFirebaseConfigured = true;
      mockAuthUser = { uid: 'guest-1', provider: 'anonymous', isAnonymous: true };
      mockRequestWebConnect.mockReturnValue(new Promise(() => {}));
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();

      act(() => {
        const onPress = findPressableByLabel(root, 'スマホと連携する').props.onPress;
        onPress();
        onPress();
      });
      expect(mockRequestWebConnect).toHaveBeenCalledTimes(1);
      await act(async () => {
        root.unmount();
      });
    });

    it('連携済み（非匿名）なら「ログアウトする」を表示し、押すと requestWebConnect を呼ぶ', async () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'web' });
      mockIsFirebaseConfigured = true;
      mockAuthUser = { uid: 'paired-1', provider: 'google', isAnonymous: false };
      mockRequestWebConnect.mockResolvedValue(undefined);
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();

      const texts = allTexts(root).join('|');
      expect(texts).toContain('ログアウトする');
      expect(texts).not.toContain('スマホと連携する');

      await act(async () => {
        findPressableByLabel(root, 'ログアウトする').props.onPress();
      });
      expect(mockRequestWebConnect).toHaveBeenCalledTimes(1);
      await act(async () => {
        root.unmount();
      });
    });

    it('ネイティブ（Platform.OS !== \'web\'）では連携/ログアウト行を表示しない', async () => {
      mockAuthUser = { uid: 'u1', provider: 'anonymous', isAnonymous: true };
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();

      const texts = allTexts(root).join('|');
      expect(texts).not.toContain('スマホと連携する');
      expect(texts).not.toContain('ログアウトする');
      await act(async () => {
        root.unmount();
      });
    });

    it('Web版でもFirebase未設定なら連携/ログアウト行を表示しない（連携ゲートが機能しないため）', async () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'web' });
      mockIsFirebaseConfigured = false;
      mockAuthUser = { uid: 'u1', provider: 'anonymous', isAnonymous: true };
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();

      const texts = allTexts(root).join('|');
      expect(texts).not.toContain('スマホと連携する');
      expect(texts).not.toContain('ログアウトする');
      await act(async () => {
        root.unmount();
      });
    });
  });

  describe('バックアップ（Apple/Google連携）', () => {
    it('連携不可（既定）のときはアカウント連携導線を出さない', async () => {
      mockUseLinkableAccountKinds.mockReturnValue([]);
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();
      expect(allTexts(root).join('|')).not.toContain('と連携');
      await act(async () => {
        root.unmount();
      });
    });

    it('連携可能なときは Apple/Google 連携ボタンを出す', async () => {
      mockUseLinkableAccountKinds.mockReturnValue(['apple', 'google']);
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();
      const text = allTexts(root).join('|');
      expect(text).toContain('Apple と連携');
      expect(text).toContain('Google と連携');
      await act(async () => {
        root.unmount();
      });
    });

    it('連携ボタンを押すと linkAccount を呼ぶ', async () => {
      mockUseLinkableAccountKinds.mockReturnValue(['apple']);
      mockLinkAccount.mockResolvedValue(undefined);
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      await flush();

      await act(async () => {
        await findPressableByLabel(root, 'Apple と連携').props.onPress();
      });

      expect(mockLinkAccount).toHaveBeenCalledWith('apple');
      await act(async () => {
        root.unmount();
      });
    });
  });

  describe('アカウント削除（data.md 第7章）', () => {
    it('isAccountDeletionAvailable=false のときは削除行を表示しない（Worker未設定時は削除できたふりをしない）', async () => {
      mockIsAccountDeletionAvailable = false;
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      expect(allTexts(root)).not.toContain('アカウントを削除する');
      await act(async () => {
        root.unmount();
      });
    });

    it('削除行を押すと確認UIを表示し、まだ削除は実行しない', async () => {
      mockIsAccountDeletionAvailable = true;
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      act(() => {
        findPressableByLabel(root, 'アカウントを削除する').props.onPress();
      });

      expect(allTexts(root)).toContain('本当に削除しますか？この操作は取り消せません。日記・対話・連携情報がすべて削除されます。');
      expect(mockDeleteAccount).not.toHaveBeenCalled();
      await act(async () => {
        root.unmount();
      });
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
        jest.advanceTimersByTime(0);
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
      await act(async () => {
        root.unmount();
      });
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
        jest.advanceTimersByTime(0);
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
      await act(async () => {
        root.unmount();
      });
    });

    it('削除に失敗した場合はエラーを表示し、確認UIのまま再試行できる（entriesStoreは触らない）', async () => {
      mockIsAccountDeletionAvailable = true;
      mockDeleteAccount.mockRejectedValue(new Error('network'));
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
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
      await act(async () => {
        root.unmount();
      });
    });

    it('「キャンセル」を押すと確認UIを閉じ、削除行に戻る', async () => {
      mockIsAccountDeletionAvailable = true;
      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(<SettingsScreen />);
      });
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      act(() => {
        findPressableByLabel(root, 'アカウントを削除する').props.onPress();
      });
      act(() => {
        findPressableByLabel(root, 'キャンセル').props.onPress();
      });

      expect(allTexts(root)).toContain('アカウントを削除する');
      expect(allTexts(root)).not.toContain('本当に削除しますか？この操作は取り消せません。日記・対話・連携情報がすべて削除されます。');
      await act(async () => {
        root.unmount();
      });
    });
  });
});

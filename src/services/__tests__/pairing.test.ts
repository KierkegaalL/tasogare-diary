import { signInWithCustomToken } from 'firebase/auth';

import { extractPairingToken, pairingQrPayload, signInWithPairingToken } from '../pairing';
import { callClaudeWorker } from '../claudeWorker/client';
import { toAuthUser } from '../auth/firebaseAuthProvider';

// pairing.ts は claudeWorker/client・firebase/app・auth/firebaseAuthProvider 経由で
// firebase（ESM・jest未対応）を読み込むため、pairingQrPayload の純ロジック検証にあたっては
// これらをモックして firebase の実 import を回避する（firebaseAuthProviderLink.test.ts と同じ方針）。
jest.mock('../claudeWorker/client', () => ({ callClaudeWorker: jest.fn() }));
jest.mock('firebase/auth', () => ({ signInWithCustomToken: jest.fn() }));
jest.mock('../firebase/app', () => ({ getFirebaseAuth: jest.fn() }));
jest.mock('../auth/firebaseAuthProvider', () => ({ toAuthUser: jest.fn() }));

const mockCallClaudeWorker = callClaudeWorker as jest.Mock;
const mockSignInWithCustomToken = signInWithCustomToken as jest.Mock;
const mockToAuthUser = toAuthUser as jest.Mock;

describe('pairingQrPayload', () => {
  const original = process.env.EXPO_PUBLIC_WEB_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_WEB_URL;
    else process.env.EXPO_PUBLIC_WEB_URL = original;
  });

  it('EXPO_PUBLIC_WEB_URL 未設定ならトークンそのものを返す', () => {
    delete process.env.EXPO_PUBLIC_WEB_URL;
    expect(pairingQrPayload('tok-123')).toBe('tok-123');
  });

  it('Web URL 設定時はペアリング用ディープリンクを返す（末尾スラッシュは正規化）', () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://tasogare-diary.app/';
    expect(pairingQrPayload('tok 123')).toBe('https://tasogare-diary.app/pair?token=tok%20123');
  });
});

// Web版連携ゲート（WebConnectGate）向け。web/src/lib/pairing.ts と同じロジック。
describe('extractPairingToken', () => {
  it('ディープリンクURLから token クエリを取り出す', () => {
    expect(extractPairingToken('https://tasogare-diary.app/pair?token=abc123')).toBe('abc123');
  });

  it('URLでなければ文字列そのものをトークンとして扱う', () => {
    expect(extractPairingToken('abc123')).toBe('abc123');
  });

  it('空文字列/空白のみは null を返す', () => {
    expect(extractPairingToken('')).toBeNull();
    expect(extractPairingToken('   ')).toBeNull();
  });

  it('URLではないが token= を含む断片からも取り出す', () => {
    expect(extractPairingToken('token=xyz')).toBe('xyz');
  });
});

describe('signInWithPairingToken', () => {
  beforeEach(() => {
    mockCallClaudeWorker.mockReset();
    mockSignInWithCustomToken.mockReset();
    mockToAuthUser.mockReset();
  });

  it('Worker照合→カスタムトークンでサインイン→AuthUserを返す（未認証で呼べる）', async () => {
    mockCallClaudeWorker.mockResolvedValue({ customToken: 'custom-1', uid: 'u1' });
    mockSignInWithCustomToken.mockResolvedValue({ user: { uid: 'u1' } });
    mockToAuthUser.mockReturnValue({ uid: 'u1', provider: 'anonymous', isAnonymous: false });

    const user = await signInWithPairingToken('tok-1');

    expect(mockCallClaudeWorker).toHaveBeenCalledWith(
      '/verifyPairingToken',
      { token: 'tok-1' },
      { requireAuth: false },
    );
    expect(mockSignInWithCustomToken).toHaveBeenCalledWith(undefined, 'custom-1');
    expect(user).toEqual({ uid: 'u1', provider: 'anonymous', isAnonymous: false });
  });
});

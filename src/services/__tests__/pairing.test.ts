import { pairingQrPayload } from '../pairing';

// pairing.ts は claudeWorker/client 経由で firebase を読み込むため、pairingQrPayload の
// 純ロジック検証にあたっては client をモックして firebase の実 import を回避する。
jest.mock('../claudeWorker/client', () => ({ callClaudeWorker: jest.fn() }));

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

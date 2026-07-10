import { callClaudeWorker } from './claudeWorker/client';
import { isClaudeWorkerConfigured } from './claudeWorker/config';

// QRペアリング（モバイル側 / api-contract.md 第5章）。
// createPairingToken は要認証のため、既存の Worker クライアント（Firebase ID トークンを付与）で呼ぶ。
// verifyPairingToken は Web ダッシュボード側の処理のため、モバイルアプリには含めない。

export interface PairingToken {
  token: string;
  expiresAt: string; // ISO8601
  ttlSeconds: number;
}

// Worker（＝ペアリング機能）が利用可能か。未設定時は QR 表示を出さずに案内する。
export const isPairingAvailable = isClaudeWorkerConfigured;

export async function createPairingToken(): Promise<PairingToken> {
  return callClaudeWorker<Record<string, never>, PairingToken>('/createPairingToken', {});
}

// QR に埋め込むペイロード。Web ダッシュボード URL が設定されていればペアリング用ディープリンク、
// 未設定ならトークン文字列そのもの（Web 側の入力欄に貼り付け）。
export function pairingQrPayload(token: string): string {
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  if (webUrl) {
    const base = webUrl.replace(/\/+$/, '');
    return `${base}/pair?token=${encodeURIComponent(token)}`;
  }
  return token;
}

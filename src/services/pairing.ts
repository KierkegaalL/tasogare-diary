import { signInWithCustomToken } from 'firebase/auth';

import { callClaudeWorker } from './claudeWorker/client';
import { isClaudeWorkerConfigured } from './claudeWorker/config';
import { getFirebaseAuth } from './firebase/app';
import { toAuthUser } from './auth/firebaseAuthProvider';
import type { AuthUser } from './auth/types';

// QRペアリング（モバイル側 / api-contract.md 第5章）。
// createPairingToken は要認証のため、既存の Worker クライアント（Firebase ID トークンを付与）で呼ぶ。

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

// ここから Web版（Platform.OS === 'web'）の連携画面向け（screen.md 4.2 相当をモバイルの
// Web ビルドでも提供する。ユーザー指摘: Webとモバイルで同じ日記を見られるようにする）。
// verifyPairingToken は未サインインで呼べる（api-contract.md 5.2）。

interface VerifyPairingTokenResult {
  customToken: string;
  uid: string;
}

// QR ペイロードからトークンを取り出す（web/src/lib/pairing.ts と同じロジック）。
// モバイルは `<WEB_URL>/pair?token=...`（ディープリンク）または トークン文字列そのものを QR 化する
// （pairingQrPayload）。同じ端末上で自分自身の QR を読む想定はないが、他のモバイル機の QR も
// 同じ形式のため共通化する。
export function extractPairingToken(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const token = url.searchParams.get('token');
    if (token) return token;
  } catch {
    // URL でなければトークン文字列そのものとして扱う。
  }
  const match = value.match(/token=([^&\s]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return value;
}

// トークンを照合してサインインする。成功で AuthUser を返す。
export async function signInWithPairingToken(token: string): Promise<AuthUser> {
  const { customToken } = await callClaudeWorker<{ token: string }, VerifyPairingTokenResult>(
    '/verifyPairingToken',
    { token },
    { requireAuth: false },
  );
  const credential = await signInWithCustomToken(getFirebaseAuth(), customToken);
  return toAuthUser(credential.user);
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

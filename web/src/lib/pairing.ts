import { signInWithCustomToken } from 'firebase/auth';

import { getFirebaseAuth } from './firebase';
import { callWorker, WorkerError } from './worker';

// QRペアリング照合（Web 初回サインイン / api-contract.md 5.2・screen.md 4.2）。
// モバイルが表示した短命トークンを Worker で照合→カスタムトークンを受け取り→サインインする。

interface VerifyPairingTokenResult {
  customToken: string;
  uid: string;
}

// QR ペイロードからトークンを取り出す。モバイルは `<WEB_URL>/pair?token=...`（ディープリンク）
// または トークン文字列そのものを QR 化する（src/services/pairing.ts の pairingQrPayload）。
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
  // クエリ断片（`?token=...` や `token=...`）にも一応対応する。
  const match = value.match(/token=([^&\s]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return value;
}

// トークンを照合してサインインする。成功で uid を返す。
export async function signInWithPairingToken(token: string): Promise<string> {
  const { customToken, uid } = await callWorker<{ token: string }, VerifyPairingTokenResult>(
    '/verifyPairingToken',
    { token },
    { withAuth: false },
  );
  try {
    await signInWithCustomToken(getFirebaseAuth(), customToken);
  } catch {
    throw new WorkerError('internal', 'サインインに失敗しました。QR を再取得してください。');
  }
  return uid;
}

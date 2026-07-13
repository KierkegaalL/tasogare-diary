import { claudeWorkerBaseUrl } from './config';
import { getFirebaseAuth } from '../firebase/app';

// Cloudflare Worker（Claude 連携プロキシ）の薄い HTTP クライアント。
// Firebase ID トークンを Authorization: Bearer で送る（worker/src/auth.ts が検証する）。

export class ClaudeWorkerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function getIdToken(): Promise<string> {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) {
      throw new ClaudeWorkerError('unauthenticated', 'サインインが必要です。');
    }
    return await user.getIdToken();
  } catch (err) {
    if (err instanceof ClaudeWorkerError) throw err;
    throw new ClaudeWorkerError('unauthenticated', 'ID トークンの取得に失敗しました。再度お試しください。');
  }
}

export async function callClaudeWorker<Req, Res>(
  path: string,
  data: Req,
  options: { requireAuth?: boolean } = {},
): Promise<Res> {
  const { requireAuth = true } = options;
  if (!claudeWorkerBaseUrl) {
    throw new ClaudeWorkerError('internal', 'Claude Worker の URL が未設定です。');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (requireAuth) {
    headers.Authorization = `Bearer ${await getIdToken()}`;
  }

  let response: Response;
  try {
    response = await fetch(`${claudeWorkerBaseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  } catch {
    throw new ClaudeWorkerError('unavailable', 'ネットワークエラーが発生しました。再度お試しください。');
  }

  if (!response.ok) {
    let code = 'internal';
    let message = '通信エラーが発生しました。';
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      if (body.error?.code) code = body.error.code;
      if (body.error?.message) message = body.error.message;
    } catch {
      // レスポンスが JSON でない場合はデフォルトメッセージを使う。
    }
    throw new ClaudeWorkerError(code, message);
  }

  return (await response.json()) as Res;
}

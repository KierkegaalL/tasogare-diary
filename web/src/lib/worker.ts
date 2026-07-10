import { getFirebaseAuth } from './firebase';

// Cloudflare Worker（AI連携プロキシ）の薄い HTTP クライアント（Web 側）。
// モバイルの src/services/claudeWorker/client.ts と対応。認証必須のエンドポイントには
// Firebase ID トークンを Authorization: Bearer で付与する（worker/src/auth.ts が検証）。
// verifyPairingToken のみ未サインインで呼べる（api-contract.md 5.2）ため withAuth=false で使う。

export const workerBaseUrl = process.env.NEXT_PUBLIC_WORKER_URL;

export const isWorkerConfigured = Boolean(workerBaseUrl);

export class WorkerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkerError';
  }
}

async function getIdToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) {
    throw new WorkerError('unauthenticated', 'サインインが必要です。');
  }
  try {
    return await user.getIdToken();
  } catch {
    throw new WorkerError('unauthenticated', 'ID トークンの取得に失敗しました。再度お試しください。');
  }
}

export async function callWorker<Req, Res>(
  path: string,
  data: Req,
  options: { withAuth?: boolean } = {},
): Promise<Res> {
  const { withAuth = true } = options;
  if (!workerBaseUrl) {
    throw new WorkerError('internal', 'Worker の URL が未設定です。');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth) {
    headers.Authorization = `Bearer ${await getIdToken()}`;
  }

  let response: Response;
  try {
    response = await fetch(`${workerBaseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  } catch {
    throw new WorkerError('unavailable', 'ネットワークエラーが発生しました。再度お試しください。');
  }

  if (!response.ok) {
    let code = 'internal';
    let message = '通信エラーが発生しました。';
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      if (body.error?.code) code = body.error.code;
      if (body.error?.message) message = body.error.message;
    } catch {
      // レスポンスが JSON でない場合は既定メッセージを使う。
    }
    throw new WorkerError(code, message);
  }

  return (await response.json()) as Res;
}

import { ApiError } from './llm';
import type { Env } from './env';
import { consumePairing, createPairing, getPairing } from './firestore';
import { mintCustomToken } from './serviceAccount';

// QRペアリング（api-contract.md 第5章 / data.md 3.6）。
// - createPairingToken: 認証必須。発行元 uid で短命トークン（60秒）を pairings に作成し QR 用に返す。
// - verifyPairingToken: 未サインイン可。トークンを照合・消費し、カスタムトークンを返す（Web 初回サインイン）。

const TTL_SECONDS = 60;

// 十分な長さのランダムトークン（URLセーフ）。ドキュメントIDに使う。
function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface CreatePairingTokenResult {
  token: string;
  expiresAt: string; // ISO8601
  ttlSeconds: number;
}

// 5.1 createPairingToken（モバイル、要認証）。
export async function handleCreatePairingToken(
  env: Env,
  uid: string,
): Promise<CreatePairingTokenResult> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000);
  await createPairing(env, token, {
    uid,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  return { token, expiresAt: expiresAt.toISOString(), ttlSeconds: TTL_SECONDS };
}

export interface VerifyPairingTokenResult {
  customToken: string;
  uid: string;
}

// 5.2 verifyPairingToken（Web、未サインイン可）。
export async function handleVerifyPairingToken(
  env: Env,
  data: Record<string, unknown>,
): Promise<VerifyPairingTokenResult> {
  const token = data.token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new ApiError(400, 'invalid-argument', 'token は必須です。');
  }

  const pairing = await getPairing(env, token);
  // 失効/使用済/不正はいずれも failed-precondition（Web は再取得を促す。api-contract 5.2）。
  if (!pairing) {
    throw new ApiError(400, 'failed-precondition', 'ペアリングコードが無効です。QRを再取得してください。');
  }
  if (pairing.consumed || new Date(pairing.expiresAt).getTime() <= Date.now()) {
    throw new ApiError(400, 'failed-precondition', 'ペアリングコードは失効または使用済みです。QRを再取得してください。');
  }

  // 二重消費防止（precondition）。競合時は failed-precondition が投げられる。
  await consumePairing(env, token, pairing.updateTime);

  const customToken = await mintCustomToken(env, pairing.uid);
  return { customToken, uid: pairing.uid };
}

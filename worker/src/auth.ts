import { createRemoteJWKSet, jwtVerify } from 'jose';

// Firebase ID トークンの検証（Firebase Admin SDK を使わず、サードパーティ JWT ライブラリで検証する方式）。
// 参照: Firebase 公式手順「Verify ID tokens using a third-party JWT library」に準拠。
// - JWKS: securetoken@system.gserviceaccount.com の公開鍵（Google が提供、鍵はローテーションされる）
// - iss:  https://securetoken.google.com/<project-id>
// - aud:  <project-id>
// - sub:  空でない文字列（= uid）。128文字以内。
// - auth_time: 現在時刻以前であること

const JWKS_URI = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// リモート JWKS はモジュールスコープでキャッシュ（jose がキー取得・キャッシュを内部管理する）。
const jwks = createRemoteJWKSet(new URL(JWKS_URI));

export class AuthError extends Error {}

// Authorization: Bearer <IDトークン> を検証し uid を返す。不正・失効時は AuthError を投げる。
export async function verifyFirebaseIdToken(authHeader: string | null, projectId: string): Promise<string> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Authorization ヘッダがありません。');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new AuthError('トークンが空です。');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    }));
  } catch {
    throw new AuthError('トークンの検証に失敗しました。');
  }

  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 128) {
    throw new AuthError('トークンの sub が不正です。');
  }
  const authTime = payload.auth_time;
  if (typeof authTime === 'number' && authTime * 1000 > Date.now()) {
    throw new AuthError('auth_time が未来の時刻です。');
  }

  return sub; // uid
}

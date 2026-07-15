import type { LlmEnv } from './llm';

// Worker が参照する環境変数（Cloudflare の Secret / vars）。
// - FIREBASE_PROJECT_ID: ID トークン検証に使用（vars、公開可能）。
// - LLM_* / GEMINI_*: LLM プロバイダ選択・設定（LlmEnv を継承。API キーは Secret）。
// - FIREBASE_SERVICE_ACCOUNT: QRペアリングのカスタムトークン発行・Firestore Admin アクセスに使用する
//   サービスアカウント秘密鍵（JSON 文字列。Secret）。ペアリング機能を使わない環境では未設定でよい。
// - CRON_MAX_USERS / CRON_INSIGHT_TYPES: Cron 事前生成の上限・対象タイプ（vars、任意。cron.ts）。
export interface Env extends LlmEnv {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  // Cron 事前生成の1回あたり処理ユーザー数上限（既定20）。
  CRON_MAX_USERS?: string;
  // Cron 事前生成の対象タイプ（カンマ区切り。既定 "weekly,monthly"）。
  CRON_INSIGHT_TYPES?: string;
}

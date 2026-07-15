// Claude 連携プロキシ（Cloudflare Worker）のベース URL。
// Firebase Blaze プランを使わず Spark プランを維持するため、Firebase Functions ではなく
// Cloudflare Workers 上のプロキシ（worker/）を利用する（environments.md）。
// 値は環境変数から読み込む。未設定ならモック実装にフォールバックする（isFirebaseConfigured と同様の判定）。
export const claudeWorkerBaseUrl = process.env.EXPO_PUBLIC_CLAUDE_WORKER_URL;

export const isClaudeWorkerConfigured = Boolean(claudeWorkerBaseUrl);

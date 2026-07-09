# worker — たそがれ日記 AI連携プロキシ（Cloudflare Workers）

AI（現在は **Google Gemini API**）へのアクセスを **Cloudflare Workers 経由**で提供する。API キーはクライアントに埋め込まず、Worker の Secret にのみ保持する（[constraints.md](../.claude/rules/constraints.md) / [api-contract.md](../docs/api-contract.md)）。

**Firebase Blaze プランを使わず Spark プラン（無料枠）を維持する**ための構成。Firebase Functions（Cloud Functions）は世代を問わず Blaze プラン必須のため、AI 連携のプロキシ部分のみ Cloudflare Workers（クレジットカード登録不要の無料枠あり）に置く。Firestore / Authentication は引き続き Firebase（Spark）を使う。

> **LLM プロバイダについて**: 当初 Anthropic（Claude）を想定していたが、**無料での運用を優先**し Google Gemini API（Gemini Developer API・無料枠）に変更した（ユーザー判断）。ルーティング・認証・エラー設計（[src/index.ts](src/index.ts)）はプロバイダ非依存で、呼び出し実装（[src/llm.ts](src/llm.ts)）のみを差し替えれば将来 Anthropic 等へ戻すことも可能。

## 実装済みエンドポイント（要 Firebase ID トークン）

| パス | 用途 | モデル（既定） | 対応（api-contract.md） |
|---|---|---|---|
| `POST /suggestWords` | 連想語提案 | `gemini-3.1-flash-lite` | 3.1 |
| `POST /generateDiary` | 日記文生成 | `gemini-3.5-flash` | 3.2 |
| `POST /adjustDiary` | 調整・再生成 | `gemini-3.1-flash-lite` | 3.3 |
| `POST /chat` | AI対話 | `gemini-3.1-flash-lite` | 3.4 |
| `POST /chatOpening` | 初回問いかけ | `gemini-3.1-flash-lite` | 3.4 |

> 未実装（別タスク）: `generateInsight`（週次/月次まとめ・3.5）、QR ペアリング（第5章）、`deleteAccount`（第6章）。`chat` のサーバ側文脈補完（当該エントリ本文/過去要約）も将来対応。

## 認証方式

Firebase Callable（`context.auth`）の代わりに、クライアントが取得した **Firebase ID トークン**を `Authorization: Bearer <IDトークン>` で送る。Worker 側は Firebase Admin SDK を使わず、サードパーティ JWT ライブラリ（[`jose`](https://github.com/panva/jose)）で Google の公開鍵（JWKS）を用いて検証する（[src/auth.ts](src/auth.ts)、Firebase 公式手順「Verify ID tokens using a third-party JWT library」に準拠）。

## 前提

- Cloudflare アカウント（無料枠。クレジットカード登録不要）。
- **Gemini API キー**（無料）を [Google AI Studio](https://aistudio.google.com/apikey) で発行し、Worker の Secret に登録する。
- `FIREBASE_PROJECT_ID`（`wrangler.jsonc` の `vars`、公開可能な値）をクライアントの `EXPO_PUBLIC_FIREBASE_PROJECT_ID` と一致させる。

## セットアップ

```bash
# 1) 依存インストール
npm --prefix worker install

# 2) 型チェック
npm --prefix worker run typecheck

# 3) Cloudflare にログイン（初回のみ）
npx wrangler login

# 4) Gemini API キーを Secret に登録（対話プロンプトで直接貼り付ける。ファイル/パイプ経由は
#    改行混入の原因になるため避ける）
# 重要: Secret 名は必ず GEMINI_API_KEY にすること（src/llm.ts が参照する名前と一致させる）。
npx wrangler secret put GEMINI_API_KEY --cwd worker

# 5) デプロイ
npm --prefix worker run deploy
```

デプロイ完了後に表示される URL（例: `https://tasogare-diary-claude-proxy.<subdomain>.workers.dev`）を、クライアントの `.env` の `EXPO_PUBLIC_CLAUDE_WORKER_URL` に設定する。

## モデルの環境変数（差し替え可能）

用途別モデルは `wrangler.jsonc` の `vars`（`wrangler secret put` ではなく通常の変数）で上書きできる（[environments.md](../.claude/rules/environments.md) / api-contract.md 1.3）。

| 変数 | 既定 | 用途 |
|---|---|---|
| `GEMINI_MODEL_INTERACTIVE` | `gemini-3.1-flash-lite` | 連想語提案 / 調整 / 対話（低遅延・低コスト優先） |
| `GEMINI_MODEL_GENERATE` | `gemini-3.5-flash` | 日記文生成（品質優先） |

## ローカル開発

```bash
npm --prefix worker run dev
```

`.dev.vars`（gitignore 済み）に `GEMINI_API_KEY=...` を書けばローカル実行時にも読み込める（[wrangler のドキュメント](https://developers.cloudflare.com/workers/configuration/secrets/#local-development-with-secrets)参照）。

## クライアント側の切替

クライアントは `isClaudeWorkerConfigured`（`src/services/claudeWorker/config.ts`、`EXPO_PUBLIC_CLAUDE_WORKER_URL` の有無で判定）で自動切替する。

- 未設定 → モック（`src/services/diaryApi.mock.ts`、ローカル完結）
- 設定済 → 本 Worker を HTTP 経由で呼ぶ（`src/services/diaryApi.functions.ts` → `src/services/claudeWorker/client.ts`）

> クライアント側のディレクトリ・関数名は `claudeWorker` のままとしている（機能名としての「AI連携」を指し、裏側の LLM プロバイダとは独立させているため）。

## プライバシー・ログ方針

- AI へは最小限のみ送信。日記本文・送受信ペイロードは**ログに残さない**（メタ情報のみ）。
- モデル/プロンプト版は `promptVersion` として返却（本文とは別に追跡）。

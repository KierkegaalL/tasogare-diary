# environments.md — 環境定義

> 実際の値（プロジェクトID、URL、キー）はステップ4で確定する。シークレットはリポジトリにコミットせず、`.env`（gitignore）/ EAS Secrets / Functions config で管理すること。

## 環境一覧

| 環境 | 用途 | Firebase プロジェクト | AI API |
|---|---|---|---|
| `dev` | ローカル開発 | `tasogare-diary-dev`（想定） | dev キー |
| `staging` | 検証・社内配布 | `tasogare-diary-staging`（想定） | staging キー |
| `prod` | 本番 | `tasogare-diary-prod`（想定） | prod キー |

## API ベース URL（想定）

| 種別 | dev | staging | prod |
|---|---|---|---|
| AI 連携プロキシ（Cloudflare Worker） | `http://localhost:8787`（`wrangler dev`） | `https://tasogare-diary-claude-proxy-staging.<subdomain>.workers.dev`（想定） | `https://tasogare-diary-claude-proxy.<subdomain>.workers.dev`（想定） |
| Gemini API | `https://generativelanguage.googleapis.com`（Worker 経由で呼び出し。クライアントから直叩きしない） | 同左 | 同左 |
| Web ダッシュボード（Firebase Hosting） | `http://localhost:3000`（Next.js dev） | `https://staging.tasogare-diary.app`（想定） | `https://tasogare-diary.app`（想定） |

> **重要**: AI API キーはクライアントに埋め込まず、必ずサーバ側プロキシ（Cloudflare Worker）経由で呼び出す（[constraints.md](constraints.md) のプライバシー方針参照）。

## AI モデル設定（確定事項 U-12・2026-07-09 改定: 無料運用のため Gemini へ変更）

用途別にモデルを使い分け、環境変数（Secrets/vars）で差し替え可能にする（[api-contract.md](../../docs/api-contract.md) 第1.3節）。

> **プロバイダ変更の経緯**: 当初 Anthropic（Claude Haiku 4.5 / Sonnet 5）を採用していたが、**課金を発生させず無料枠で運用したい**というユーザー方針により、**Google Gemini API（Gemini Developer API・無料枠）**に変更した。将来アプリが軌道に乗る／AI 能力に不満が出た場合は Anthropic 等の有料 API へ戻す可能性がある（`worker/src/llm/` にプロバイダ抽象化済み。実装1ファイル追加＋セレクタ分岐追加で移管できる設計）。

| 用途 | モデル（既定） |
|---|---|
| 連想語提案 / AI対話 / 調整 | `gemini-3.1-flash-lite`（低遅延・低コスト） |
| 日記文生成 / 週次・月次まとめ | `gemini-3.5-flash`（品質優先） |

> モデル ID は環境変数（例: `GEMINI_MODEL_INTERACTIVE` / `GEMINI_MODEL_GENERATE`）で上書き可能とし、dev/staging/prod で切り替えられるようにする。

## AI 実接続プロキシ（Phase2・Cloudflare Workers）

**Firebase は Spark プラン（無料枠）を維持する**方針のため、AI 連携は **Firebase Functions ではなく Cloudflare Workers 経由**で呼び出す（クライアント直叩き禁止）。Firebase Functions（Cloud Functions）は世代を問わず Blaze プラン必須のため採用しない。実装は `worker/`（別 npm プロジェクト・TypeScript／Cloudflare Workers ランタイム）。詳細・デプロイ手順は [worker/README.md](../../worker/README.md)。

- **Gemini API キー**は Cloudflare の Secret に保持（`wrangler secret put GEMINI_API_KEY`）。**リポジトリ／`.env`／クライアントには置かない**（[constraints.md](constraints.md)）。
- **認証**: Firebase Callable の `context.auth` は使えないため、クライアントが取得した **Firebase ID トークン**を `Authorization: Bearer` で送り、Worker 側がサードパーティ JWT ライブラリ（`jose`）で検証する（`worker/src/auth.ts`）。Firebase 側は **Spark プランのまま**（Firestore/Authentication のみ使用、Functions は使わない）。
- モデルは Worker の環境変数 `GEMINI_MODEL_INTERACTIVE` / `GEMINI_MODEL_GENERATE`（上表・`wrangler.jsonc` の `vars`）で差し替え可能。
- クライアントは `isClaudeWorkerConfigured`（`EXPO_PUBLIC_CLAUDE_WORKER_URL` の有無、`src/services/claudeWorker/config.ts`）により **モック（未設定）↔ Worker（設定済）** を自動切替する（`src/services/diaryApi.ts`）。ディレクトリ名・関数名に `claudeWorker` を残しているが、裏側の LLM プロバイダとは独立させている（`worker/README.md` 参照）。

## デバイス要件

- **iOS**: iOS 15 以上を想定
- **Android**: Android 8（API 26）以上を想定
- Expo SDK は最新安定版を採用（実装開始時に確定）
- 開発は Expo Go / Development Build いずれも可。ネイティブモジュール導入時は Development Build に切替。

## 環境切り替え

- `app.config.ts` の `extra` + `process.env.APP_ENV` で環境を分岐する想定
- Firebase 設定は環境ごとに読み分ける（[.claude/skills/firebase](../skills/firebase) 参照）

## Firebase クライアント設定（Phase2・匿名認証）

**当面はアプリ配布しない**前提のため、認証は **Firebase 匿名認証（JS SDK）** を採用（開発ビルド／Apple Developer Program 不要・Expo Go 可）。ただし**将来、任意のタイミングでアプリ配布も考慮する**ため、認証は差し替え可能なプロバイダ抽象で実装し、配布時に Apple/Google サインイン（匿名アカウントへのリンク昇格）へ拡張できるようにしておく。

- クライアント設定は環境変数 `EXPO_PUBLIC_FIREBASE_*` から読み込む（[.env.example](../../.env.example)、`src/services/firebase/config.ts`）。**公開可能なクライアント値のみ**で、シークレットは含めない。
- 値が揃うと `isFirebaseConfigured=true` となり、認証がローカル匿名 → Firebase 匿名認証へ自動で切り替わる（`src/services/auth`）。
- **セットアップ手順**:
  1. Firebase Console で無料プロジェクト作成（環境ごと推奨: dev/staging/prod）
  2. 「ウェブアプリ」を追加し `firebaseConfig` を取得
  3. Authentication → Sign-in method → **匿名（Anonymous）を有効化**
  4. 取得値を `.env`（gitignore 済み）に設定 → 再起動で Firebase 匿名認証に切替
- Apple/Google サインインは、恒久アカウントが要る段階（「Webで見る」/バックアップ）で **匿名アカウントへリンク**して昇格する。**昇格ロジックは実装済み**（`firebaseAuthProvider.linkWith`＝`linkWithCredential`、`authStore.linkAccount`、`WebConnectScreen` の導線。`credential-already-in-use` 等のエラーは `AuthLinkError` に写像）。ただし**ネイティブのサインインUI（Apple/Google の資格情報取得）は開発ビルド前提の後続**で、`OAuthCredentialSource` シーム（`src/services/auth/credentialSource.ts`）越しに差し替える設計。既定（Expo Go）はシーム未提供のため `canLinkAccount()` が false となり導線を出さない。配布ビルドで `setCredentialSource` に expo-apple-authentication / Google サインイン等の実装を注入する。

## Web ダッシュボード クライアント設定（Phase4・`web/`）

Web ダッシュボード（`web/`・Next.js 静的エクスポート）は**モバイルと同一 Firebase プロジェクト**を参照する（同じ Firestore を読む）。設定値は `NEXT_PUBLIC_*` から読み込む（[web/.env.example](../../web/.env.example)、`web/src/lib/firebase.ts`）。**公開可能なクライアント値のみ**で、シークレットは含めない。

- `NEXT_PUBLIC_FIREBASE_*`: モバイルの `EXPO_PUBLIC_FIREBASE_*` と同一プロジェクトの値。
- `NEXT_PUBLIC_WORKER_URL`: Cloudflare Worker の URL（モバイルの `EXPO_PUBLIC_CLAUDE_WORKER_URL` と同一）。QRペアリング照合（`verifyPairingToken`）とまとめ取得（`generateInsight`）に使う。
- 初回サインインは**モバイルの QR ペアリング**（`web/src/app/pair`・`web/src/app/connect`）。Apple/Google サインインは上記の恒久アカウント昇格タスクと合わせて対応する。詳細は [web/README.md](../../web/README.md)。
- **対になるモバイル側変数**: QR に `<WEB_URL>/pair?token=…` のディープリンクを埋め込むには、モバイルの `EXPO_PUBLIC_WEB_URL` に Web デプロイ URL を設定する（`src/services/pairing.ts` の `pairingQrPayload`）。未設定時はトークン文字列のみを QR 化し、Web 側は `/connect` でその文字列を貼り付けて連携する。
- **デプロイ**: リポジトリルートの `firebase.json`（`hosting` セクション）・`.firebaserc`（`staging`/`prod` エイリアス）で Firebase Hosting 配信を定義済み。手順は [web/README.md](../../web/README.md) の「デプロイ」節。`dev` は Hosting を使わずローカル起動のみ。

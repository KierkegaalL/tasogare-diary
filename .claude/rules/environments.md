# environments.md — 環境定義

> 実際の値（プロジェクトID、URL、キー）はステップ4で確定する。シークレットはリポジトリにコミットせず、`.env`（gitignore）/ EAS Secrets / Functions config で管理すること。

## 環境一覧

| 環境 | 用途 | Firebase プロジェクト | Claude API |
|---|---|---|---|
| `dev` | ローカル開発 | `tasogare-diary-dev`（想定） | dev キー |
| `staging` | 検証・社内配布 | `tasogare-diary-staging`（想定） | staging キー |
| `prod` | 本番 | `tasogare-diary-prod`（想定） | prod キー |

## API ベース URL（想定）

| 種別 | dev | staging | prod |
|---|---|---|---|
| Firebase Functions | `http://localhost:5001/.../us-central1` （エミュレータ） | `https://<region>-tasogare-diary-staging.cloudfunctions.net` | `https://<region>-tasogare-diary-prod.cloudfunctions.net` |
| Claude API | `https://api.anthropic.com`（Functions 経由で呼び出し。クライアントから直叩きしない） | 同左 | 同左 |
| Web ダッシュボード（Firebase Hosting） | `http://localhost:3000`（Next.js dev） | `https://staging.tasogare-diary.app`（想定） | `https://tasogare-diary.app`（想定） |

> **重要**: Claude API キーはクライアントに埋め込まず、必ず Firebase Functions 経由で呼び出す（[constraints.md](constraints.md) のプライバシー方針参照）。

## Claude モデル設定（確定事項 U-12）

用途別にモデルを使い分け、環境変数（Functions config / Secrets）で差し替え可能にする（[api-contract.md](../../docs/api-contract.md) 第1.3節）。

| 用途 | モデル（既定） |
|---|---|
| 連想語提案 / AI対話 / 調整 | `claude-haiku-4-5-20251001`（Haiku 4.5） |
| 日記文生成 / 週次・月次まとめ | `claude-sonnet-5`（Sonnet 5） |

> モデル ID は環境変数（例: `CLAUDE_MODEL_INTERACTIVE` / `CLAUDE_MODEL_GENERATE`）で上書き可能とし、dev/staging/prod で切り替えられるようにする。

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
- Apple/Google サインインは、恒久アカウントが要る段階（「Webで見る」/バックアップ）で **匿名アカウントへリンク**して昇格する（別タスク）。

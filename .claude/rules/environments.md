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

> **重要**: Claude API キーはクライアントに埋め込まず、必ず Firebase Functions 経由で呼び出す（[constraints.md](constraints.md) のプライバシー方針参照）。

## デバイス要件

- **iOS**: iOS 15 以上を想定
- **Android**: Android 8（API 26）以上を想定
- Expo SDK は最新安定版を採用（実装開始時に確定）
- 開発は Expo Go / Development Build いずれも可。ネイティブモジュール導入時は Development Build に切替。

## 環境切り替え

- `app.config.ts` の `extra` + `process.env.APP_ENV` で環境を分岐する想定
- Firebase 設定は環境ごとに読み分ける（[.claude/skills/firebase](../skills/firebase) 参照）

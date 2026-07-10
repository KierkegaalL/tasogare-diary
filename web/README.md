# web — たそがれ日記 Web ダッシュボード（振り返り専用）

PC で日記を振り返るための **閲覧専用**ダッシュボード（[U-09](../docs/screen.md)）。**Next.js（App Router）＋静的エクスポート → Firebase Hosting** で配信する（[architecture.md](../docs/architecture.md) 第6章 案A・U-04）。

モバイル（Expo）とは別プロジェクト（別 `package.json`／`tsconfig.json`）。ルートの lint/型/テスト対象外（`eslint.config.js`・`jest.config.js`・`tsconfig.json` で `web/` を除外）なので、変更時は個別にコマンドを実行する。

## 構成

- **認証**: Firebase Auth（モバイルと同一プロジェクト）。初回サインインは**モバイルの QR ペアリング**で行う。モバイルが表示する QR（`<WEB_URL>/pair?token=…` のディープリンク）から Worker の `verifyPairingToken` を呼び、返ったカスタムトークンで `signInWithCustomToken` する（[api-contract.md](../docs/api-contract.md) 5.2）。
- **データ取得**: 週次/月次まとめ（`insights`）は Worker の `generateInsight` から取得。Worker が `entries` を集計・文章化してキャッシュを返す（**日記本文は LLM へ送らない**）。一方、日記本文の閲覧（`/entries`）は **Firestore を直読**する（`entries` は uid スコープで本人のみ read 可能：`firestore.rules`）。本文はまとめ用途では外へ出さず、閲覧はクライアントが本人の権限で直接取得する。
- **配色・型**: `../shared`（`shared/theme/tokens.ts`・`shared/types/*`）をモバイルと共有する（`@shared/*` エイリアス）。

## ルート

| パス | 役割 | 対応（screen.md） |
|---|---|---|
| `/` | サインイン状態で `/dashboard` か `/connect` へ振り分け | — |
| `/connect` | デバイスをつなぐ（QR の内容を貼り付けて連携） | 4.2 |
| `/pair?token=…` | モバイル QR ディープリンクの着地点（照合→サインイン） | 4.2 |
| `/dashboard` | 振り返りダッシュボード（感情推移・よく使う言葉・AIまとめ） | 4.1 |
| `/entries` | 日記の一覧（月ごとに本文をそのまま閲覧・Firestore 直読） | 4.3 |

## 環境変数

`.env.example` を `.env.local`（gitignore 済み）へコピーして設定する。**公開可能なクライアント値のみ**（シークレットは含めない）。

- `NEXT_PUBLIC_FIREBASE_*`: モバイルと**同一 Firebase プロジェクト**の値。
- `NEXT_PUBLIC_WORKER_URL`: Cloudflare Worker の URL（モバイルの `EXPO_PUBLIC_CLAUDE_WORKER_URL` と同一）。

未設定時は連携できない旨を表示する（`/connect`）。

## コマンド

| 目的 | コマンド |
|---|---|
| 開発サーバ（:3000） | `npm --prefix web run dev` |
| 静的ビルド（`out/`） | `npm --prefix web run build` |
| 型チェック | `npm --prefix web run typecheck` |

## 未対応（後続タスク）

- **カメラでの QR ライブ読取**（`/connect`）: 現状は QR の内容（URL／コード）を貼り付けて連携する。カメラ読取は QR デコードライブラリ導入時に追加する。
- **Apple/Google サインイン**（QR が使えない環境の代替。[screen.md](../docs/screen.md) 4.2）: 恒久アカウント昇格タスクと合わせて対応（[environments.md](../.claude/rules/environments.md)）。
- ~~**日記本文の閲覧**（Firestore 直接読取）~~: 実装済み（`/entries`・[screen.md](../docs/screen.md) 4.3）。**検索・無限スクロール**（月ナビではなく通し閲覧）は後続。
- **「過去3ヶ月」タブ**（[screen.md](../docs/screen.md) 4.1）: `generateInsight` が単一期間（weekly/monthly）のみ対応のため未実装。複数月集計の対応後に追加する。
- **Firebase Hosting へのデプロイ設定**（`firebase.json` の hosting セクション等）。

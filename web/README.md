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
| `/connect` | デバイスをつなぐ（カメラQR読取／コード貼り付け／Apple・Google サインイン代替） | 4.2 |
| `/pair?token=…` | モバイル QR ディープリンクの着地点（照合→サインイン） | 4.2 |
| `/dashboard` | 振り返りダッシュボード（期間タブ 今週/今月/過去3ヶ月・感情推移・よく使う言葉・AIまとめ） | 4.1 |
| `/entries` | 日記の一覧（無限スクロール＋検索で本文をそのまま閲覧・Firestore 直読） | 4.3 |

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

## デプロイ（Firebase Hosting・staging/prod）

リポジトリルートの [`firebase.json`](../firebase.json) の `hosting` セクションが `web/out`（静的エクスポート出力）を配信対象にしている（`cleanUrls: true` により `/entries.html` を `/entries` として配信）。プロジェクトの対応関係は [`.firebaserc`](../.firebaserc)（[environments.md](../.claude/rules/environments.md) の想定プロジェクトIDと一致）。

```bash
# 1. 静的ビルド
npm --prefix web run build   # web/out/ を生成

# 2. デプロイ（--project を必ず明示。誤って本番へ出さないよう default alias は設定していない）
firebase deploy --only hosting --project staging
firebase deploy --only hosting --project prod
```

> **前提**: `.firebaserc` の `tasogare-diary-staging` / `tasogare-diary-prod` は environments.md 記載の**想定**プロジェクトIDであり、実際に Firebase Console でプロジェクトを作成し `firebase login` 済みであることが必要。`dev` 環境は Hosting を使わずローカル (`npm --prefix web run dev`) で確認するため `.firebaserc` にエイリアスを持たない。

## 未対応（後続タスク）

- ~~**カメラでの QR ライブ読取**（`/connect`）~~: 実装済み（`web/src/components/QrScanner.tsx`。`getUserMedia`＋[`jsQR`](https://github.com/cozmo/jsQR) でデコード）。非対応ブラウザ・許可拒否時は従来の「コード（URL）を貼り付ける」導線にフォールバックする。
- ~~**Apple/Google サインイン**（QR が使えない環境の代替。[screen.md](../docs/screen.md) 4.2）~~: **Web 側実装済み**（`web/src/lib/oauth.ts` の `signInWithProvider`＝`signInWithPopup(GoogleAuthProvider / OAuthProvider('apple.com'))`。`/connect` に「または」＋Google/Apple ボタンを常設）。**利用には Firebase Console 側の設定が必要**: Authentication → Sign-in method で Google／Apple を有効化（Apple は Apple Developer の「Sign in with Apple」構成が別途必要）、および本番／プレビュードメインを承認済みドメインに追加する。**モバイル側の昇格ロジック・ネイティブ資格情報取得ともに実装済み**（`src/services/auth/firebaseAuthProvider.ts` の `linkWith`＝`linkWithCredential`／`authStore.linkAccount`／`WebConnectScreen` の導線／`nativeCredentialSource.ts`＝Apple・Google の資格情報取得中核／`nativeCredentialSourceInstall.ts` の `installNativeCredentialSource()`）。ただし**ネイティブ資格情報取得の有効化には開発ビルドが必要**（`expo-apple-authentication`／`@react-native-google-signin` 等のネイティブモジュール。Expo Go では未適用＝`OAuthCredentialSource` シーム未差し替えで導線非表示）。開発ビルドで `installNativeCredentialSource()` を呼び、かつユーザーが**モバイルで先に昇格**するまでは、未リンクの資格情報で Web サインインすると新規（空）アカウントになる（[environments.md](../.claude/rules/environments.md)）。
- ~~**日記本文の閲覧**（Firestore 直接読取）~~: 実装済み（`/entries`・[screen.md](../docs/screen.md) 4.3）。~~**検索・無限スクロール**（月ナビではなく通し閲覧）~~: 実装済み（`fetchEntriesPage` の `startAfter` カーソル＋`IntersectionObserver`。検索は読み込み済み範囲のクライアント側キーワード絞り込み）。
- ~~**「過去3ヶ月」タブ**（[screen.md](../docs/screen.md) 4.1）~~: 実装済み（`generateInsight` に `type: 'quarterly'` を追加。`periodKey` は monthly と同じ `YYYY-MM` で**末尾の月＝今月**を表し、その月を含む**直近3ヶ月**を集計する＝暦上の四半期ではない。`worker/src/insight.ts` の `quarterlyRange`）。
- ~~**Firebase Hosting へのデプロイ設定**~~: 実装済み（`firebase.json` の `hosting` セクション・`.firebaserc`）。実プロジェクト作成・CI 組み込みは後続。

# Memory — たそがれ日記 プロジェクト引き継ぎドキュメント

最終更新: 2026-07-21（**2026-07-14全体レビューのAバケット23件はPR #67〜#69で全件解消済み（develop反映・結合テスト済み）。Bバケット（コスト回避・Apple Developer Program関連）は引き続き対応不要の既知の制約。加えて本日、外出先でMetro/PC非依存でアプリを使いたいという要望に対応し、Xcode `Release`構成での直接RunによるMetro不要運用の手順を確立（`npm run ios:release`新設、下記「iOS 開発ビルド作成時の既知の詰まりどころ」最終項）**）。過去の実装経緯・不具合発見の詳細は下記「現時点で残っている実質的なタスク」1〜4項・「2026-07-14 全体レビュー」節を参照。

> このファイルは ClaudeCode がセッションをまたいで状況を引き継ぐための**状況記録ドキュメント**。ルール本体（振る舞いの指示）は [CLAUDE.md](CLAUDE.md) と `.claude/rules/` を正とし、本ファイルはそれらを前提にした**現在地のスナップショット**を保持する。矛盾があれば CLAUDE.md / `.claude/rules/` が優先。
>
> **更新運用**: 1機能（1PR）完了などのチェックポイント（[build-commands.md](.claude/rules/build-commands.md) 原則8）で、完了済み作業・残タスクの節を更新すること。「最終更新」の日付も都度更新する。

## ユーザープロフィール

- プロジェクトオーナー: Ryuji Oku（GitHub: `KierkegaalL`）。個人開発でたそがれ日記を構築中。
- やりとりは日本語（CLAUDE.md 原則5）。コミットメッセージ・PR・ドキュメントも日本語が基本。
- **コスト方針**: 課金を発生させない無料運用を優先する（Firebase は Spark プラン維持のため Cloud Functions 不採用・Cloudflare Workers 経由、AI は Anthropic から無料枠の Google Gemini API へ変更済み＝ U-12・2026-07-09）。将来アプリが軌道に乗る／AI 能力に不満が出た場合は有料 API へ戻す可能性がある（`worker/src/llm/` にプロバイダ抽象化済み）。
- **プライバシー意識が高い**: 日記本文は極めてセンシティブな個人情報という前提で、LLM へは集計値/選択語のみ送信・本文は二次利用しない・ログに残さない、という制約を一貫して要求する（[constraints.md](.claude/rules/constraints.md)）。
- **配布は当面しない**方針だが、将来のアプリ配布（開発ビルド・Apple/Google 恒久アカウント）を見据えて抽象化を先回りして依頼する傾向がある（認証プロバイダ抽象・`OAuthCredentialSource` シームなど）。
- 開発フローに厳格：ドキュメント（`docs/`）・要件（Notion）・マージ先（`develop` 固定）・実装後チェックループ（reviewer サブエージェントで指摘0件まで）を強く重視する。ClaudeCode のモデル使い分け（新規作成→Opus 4.8／既存修整・レビュー→Sonnet 5）にもこだわりがある。
- セッション消費量を気にしており、チェックポイントごとの `/compact` 提案を求めている（原則8）。

## プロジェクト構成（現在）

```
tasogare-diary/
├── CLAUDE.md                  # ルールの入口
├── Memory.md                  # 本ファイル（状況記録・セッションごとに更新）
├── README.md
├── app.config.ts              # Expo設定（config plugin: expo-font/apple-authentication/google-signin）
├── App.tsx                    # 起動エントリ（フォント/認証初期化ゲート）
├── firebase.json / .firebaserc / firestore.rules / firestore.indexes.json
├── docs/                      # 設計書（正）
│   ├── api-contract.md        # API仕様（Worker各エンドポイント・実装状況）
│   ├── architecture.md        # システム構成・画面遷移・UI・オーブ仕様
│   ├── data.md                # Firestore コレクション設計
│   ├── screen.md               # 画面仕様・実装メモ
│   └── design/
├── .claude/
│   ├── settings.json          # hooks設定
│   ├── hooks/                 # model-advisor.sh・post-edit-check.sh
│   ├── agents/reviewer.md     # レビュー専用サブエージェント（Sonnet 5固定）
│   ├── commands/check-loop.md # /check-loop スラッシュコマンド
│   ├── skills/                # firebase・react-native-expo の定型知識
│   └── rules/                 # features / build-commands / environments / git-workflow / constraints
├── src/                       # モバイル実装（Expo/React Native）
│   ├── app/                   # navigation・providers
│   ├── components/            # Orb 等
│   ├── screens/                # calendar・detail・diary（4ステップ）・home・settings（Web連携QR・バックアップ統合）
│   ├── services/               # auth・claudeWorker・firebase・firestore・repository
│   ├── stores/                  # zustand（authStore・draftStore 等）
│   ├── theme/ / types/ / utils/
├── shared/                    # モバイル・Web共有（theme/tokens・types/insight 等）
├── worker/                    # Cloudflare Workers（別npmプロジェクト）
│   └── src/: index.ts・auth.ts・account.ts・firestore.ts・insight.ts・pairing.ts・prompts.ts・serviceAccount.ts・env.ts・llm/
└── web/                        # Next.js ダッシュボード（別npmプロジェクト・静的エクスポート）
    └── src/app/: connect・pair・dashboard・entries
```

## 構築済み自動化システム

- **UserPromptSubmit hook**（`.claude/hooks/model-advisor.sh`）: 依頼文からモデル推奨（新規作成→Opus 4.8／既存修整・調査→Sonnet 5）を判定し警告を注入。現在モデルが検知できPolicy違反なら実行停止を促す（切替自体は強制できない）。
- **PostToolUse hook**（`.claude/hooks/post-edit-check.sh`、Edit/Write/MultiEdit対象）: ESLint・Prettier・`tsc --noEmit`・関連ユニットテスト（`jest --findRelatedTests`）を自動実行。未整備環境ではグレースフルに no-op。
- **reviewer サブエージェント**（`.claude/agents/reviewer.md`、Sonnet 5固定、読み取り専用: Read/Grep/Glob/Bash）: 実装後チェックループ・整合チェック・残タスク調査に使用。指摘0件になるまで「修正→再チェック」を繰り返す運用（`/check-loop` コマンドで呼び出し可）。
- **CI/CD**: 現状 GitHub Actions 等の自動CIは未構築。lint/型/テストはローカル hook 実行のみ。
- **rtk（Rust Token Killer）**: ユーザーのグローバル環境にトークン節約プロキシが導入済み（`~/.claude/RTK.md`）。`git`/`jest` 等のコマンドは hook 経由で自動的に `rtk <cmd>` へ書き換わる。**注意**: `npx jest` を rtk 経由で叩くと出力が `PASS(n) FAIL(n)` に圧縮され、スイートのコンパイル失敗（0件扱い）を見落とす。詳細を見たい時は `rtk proxy npx jest ...` で生出力を取得する。
- **Firebase Hosting デプロイ**: `firebase.json`（`hosting`セクション）＋`.firebaserc`（`staging`/`prod`エイリアス）で定義済み。実プロジェクト作成・CI組み込みは未着手。
- **Cloudflare Workers デプロイ**: `worker/` は `wrangler deploy`（`npm --prefix worker run deploy`）で手動デプロイ。定期実行（`generateInsight`の事前生成）は Cron Triggers（`wrangler.jsonc`の`triggers.crons`）で実装・`develop`へマージ済み（`worker/src/cron.ts`。2026-07-12）。

## 重要な技術情報

### 技術スタック
- モバイル: Expo SDK 57 / React Native 0.86 / React 19.2 / TypeScript / zustand / react-navigation / react-native-reanimated 4.5 / Firebase JS SDK 12
- Worker: Cloudflare Workers（TypeScript）/ wrangler 4 / `jose`（JWT自前署名）/ vitest
- Web: Next.js 16（App Router・静的エクスポート `output: export`）/ React 19.2 / Firebase JS SDK / jsQR
- AI: Google Gemini API（Gemini Developer API・無料枠）。`gemini-3.1-flash-lite`（対話系）／`gemini-3.5-flash`（生成系）。プロバイダ抽象化済みで将来 Anthropic 等へ切替可能

### Firebase プロジェクト
- `.firebaserc`: `staging` = `tasogare-diary-staging`、`prod` = `tasogare-diary-prod`
- `worker/wrangler.jsonc` の既定 `FIREBASE_PROJECT_ID` = `tasogare-diary-project`（dev/ローカル用途と推測。環境ごとの環境別上書きは wrangler.jsonc 内コメントアウト済みテンプレートあり）
- Firestore は **Spark プラン**維持（Cloud Functions 不採用）。セキュリティルールは uid スコープの本人限定 read/write（`firestore.rules`）。集計/インサイト/ペアリングは Worker のサービスアカウント経由（Admin権限）でのみ書込

### 環境変数（モバイル `.env`／`.env.example` 参照。値はコミットしない）
- `EXPO_PUBLIC_FIREBASE_*`（API_KEY / AUTH_DOMAIN / PROJECT_ID / STORAGE_BUCKET / MESSAGING_SENDER_ID / APP_ID）: Firebase クライアント設定
- `EXPO_PUBLIC_CLAUDE_WORKER_URL`: Cloudflare Worker のURL（未設定時はモック動作）
- `EXPO_PUBLIC_WEB_URL`: QRペアリングのディープリンク生成用（任意）
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`: ネイティブGoogleサインイン用（任意・開発ビルドのみ有効）
- Worker側シークレット（`.env`ではなく `wrangler secret put`）: `GEMINI_API_KEY`・`FIREBASE_SERVICE_ACCOUNT`
- Web側（`web/.env.local`）: `NEXT_PUBLIC_FIREBASE_*`・`NEXT_PUBLIC_WORKER_URL`

### よく使うコマンド
| 目的 | コマンド |
|---|---|
| モバイル: 依存インストール | `npm install` |
| モバイル: 開発サーバ | `npx expo start` |
| モバイル: lint / 型 / test | `npm run lint` / `npm run typecheck` / `npm test`（rtk経由の出力圧縮に注意。詳細は `rtk proxy npx jest ...`） |
| Worker: 型 / test / dev / deploy | `npm --prefix worker run typecheck` / `npm --prefix worker test` / `npm --prefix worker run dev` / `npm --prefix worker run deploy` |
| Web: dev / build / 型 | `npm --prefix web run dev`（:3000） / `npm --prefix web run build` / `npm --prefix web run typecheck` |
| Firebase Hosting デプロイ | `firebase deploy --only hosting --project staging\|prod`（`--project` 必須・default alias 未設定） |
| 実装後チェックループ | `/check-loop`（reviewer サブエージェントで指摘0件まで反復） |

### iOS 開発ビルド作成時の既知の詰まりどころ
- **`pod install` が UTF-8 ロケール警告で落ちる**: `LANG`/`LC_ALL` が未設定だと Ruby の `unicode_normalize` がクラッシュする。**Claude Code のターミナル（本ツールの Bash 環境と同じ）はログインシェルではないため `~/.zshrc` 等の `export` を読み込まない** — 恒久対策として `package.json` の `ios` スクリプトに `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` を埋め込み済み（`npm run ios` で回避）。手動で `pod install` する場合は毎回コマンド先頭に付ける。
- **`pod install` が `AppCheckCore`/`GoogleUtilities`/`RecaptchaInterop` の未モジュール化エラーで失敗**（`@react-native-google-signin/google-signin` 由来）: `app.config.ts` の `plugins` に `expo-build-properties`（`{ ios: { useFrameworks: 'static' } }`）を追加して解消（PR #45）。`ios/` は `expo prebuild` のたびに再生成される（`.gitignore` 済み）ため、`ios/Podfile` を直接編集しても消える。config plugin 経由が正しい直し方。
- **無料 Apple ID（Personal Team）で `xcodebuild`/Xcode の Signing & Capabilities が「Personal development teams... do not support the Sign In with Apple capability」で失敗**: `expo-apple-authentication` は `app.config.ts` の `plugins` に列挙していなくても、パッケージ root の `app.plugin.js` が `@expo/prebuild-config` の `versionedExpoSDKPackages` 経由で自動適用され、entitlement `com.apple.developer.applesignin` を注入し続ける（`expo config --type introspect` の `plugins`/`usesAppleSignIn` には出てこないのに `ios/app/app.entitlements` には残る、という紛らわしい挙動）。対処は `app.config.ts` に `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED` フラグを新設し、無効時は `withEntitlementsPlist`（`expo/config-plugins`）で当該キーを明示的に `delete` する（`withoutAppleSignInEntitlement`）。**同じフラグを `nativeCredentialSourceInstall.ts` の Apple 可用性判定にも使うこと**（`AppleAuthentication.isAvailableAsync()` は entitlement の有無を見ず OS 対応のみで `true` を返すため、ビルド側だけ無効化すると「表示されるが押すと必ず失敗するボタン」になる。reviewer 指摘で発覚）。Apple サインインは有料 Developer Program 加入までスキップし Google のみで検証する方針。
- **実機で Google ネイティブサインインが `RNGoogleSignin: failed to determine clientID - GoogleService-Info.plist was not found and iosClientId was not provided` でクラッシュ**: 本プロジェクトは `GoogleService-Info.plist` を使わず環境変数ベースで運用しているため、iOS では `GoogleSignin.configure()` に `webClientId` だけでなく **`iosClientId`（新規 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`）も必須**（Android は `webClientId` のみで良い）。既存の `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`（逆順クライアントID・リダイレクト受け取り用）とは別の値で、どちらも同じ Firebase Console の iOS アプリ用 OAuth クライアントから取得する。`nativeCredentialSourceInstall.ts` の `googleConfigured` 判定を `Platform.OS !== 'ios' || Boolean(googleIosClientId)` に変更し、iOS で未設定なら `configure()` 自体を呼ばずクラッシュを防ぐ。
- **iOS で Google サインイン画面は出るが「Your app is missing support for the following URL schemes: app-1-...」でネイティブエラー**: `@react-native-google-signin` の新しい iOS SDK（AppCheck連携。Podfile.lock に `AppCheckCore`/`GoogleUtilities`/`RecaptchaInterop` が入るのはこのため）は、逆順クライアントIDの URL scheme とは**別**に、Firebase **iOS アプリ**の App ID（形式 `1:PROJECT:ios:HASH`。**`EXPO_PUBLIC_FIREBASE_APP_ID` は Web アプリの App ID で別物**）から派生した URL scheme（`:`→`-`、`app-`プレフィックス。例 `app-1-1234567890-ios-abcdef`）の登録も要求する。新規 `EXPO_PUBLIC_FIREBASE_IOS_APP_ID` を追加し、`app.config.ts` の `withGoogleSignInAppIdUrlScheme`（`withInfoPlist` で `CFBundleURLTypes` に追加エントリを push）で対応。
- **iOS でサインイン画面は出るが `account.google.com` で404**: `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` に、上記の派生 URL scheme 文字列（`app-1-...-ios-...`）を誤って設定してしまうミスが実際に発生（似た形式の値が複数あり紛らわしい）。正しくは `GoogleService-Info.plist` の `CLIENT_ID`（`....apps.googleusercontent.com` で終わる）。設定ミスに気づくには `.env` の値を実際に読んで書式チェックするのが早い（`.apps.googleusercontent.com`終わりか等）。
- **Expo Web で `EXPO_PUBLIC_ENABLE_NATIVE_AUTH=1` を設定すると `RNGoogleSignIn: ... Web support is only available to sponsors` 警告→`PLAY_SERVICES_NOT_AVAILABLE` で失敗**: `@react-native-google-signin`/`expo-apple-authentication` は Web 実装を持たない。ネイティブ資格情報取得は元々 iOS/Android の開発ビルド専用（Web は QRペアリング経由で恒久アカウント化する設計）だが、`nativeAuthBootstrap.ts` の `bootstrapNativeCredentialSource()` に Platform ガードが無く実装漏れで顕在化した。`if (!enabled || Platform.OS === 'web') return;` を追加して解消。
- **外出先（PC/Metro非起動）でもアプリを使いたい場合は、Xcodeの実行構成を `Release` にしてRunする**（2026-07-21・ユーザー要望への回答）: Debug構成（既定）はJSバンドルを実行時にMetro（`expo start`）から取得するため、Mac側でMetroが起動していないと（同一Wi-Fi到達性も含め）アプリが動かない。`Release`構成はビルド時にJSバンドルをアプリ本体へ埋め込むため、インストール後はMetro・Mac起動・同一ネットワークいずれも不要になり、外出先（セルラー回線のみ）でも通常どおり動作する（Firebase/Cloudflare Worker等の外部エンドポイントへの通信は従来どおり必要）。`__DEV__`分岐は`src/`に存在しないため、Release化による機能差異は無い。**Xcodeでの操作**: `ios/app.xcworkspace`を開く→ `Product > Scheme > Edit Scheme > Run > Build Configuration` を `Release` に変更→実機を選択して ▶ Run。CLIでも同等（`npm run ios:release` を新設。実体は `expo run:ios --configuration Release --device`）。**TestFlightは不要**（無料 Apple ID の Personal Team でも、Debug/Releaseいずれの構成も実機へ直接インストール可能。TestFlightは有料Developer Program必須のため、この用途ではむしろ不要な制約が増える）。**唯一の制約**: 無料 Apple ID（Personal Team）の署名は7日間で失効するため、7日おきにMacへ再接続し同じ手順でRunし直す必要がある（Apple Developer Program年額$99加入で解消可能。加入していない現状の方針＝Bucket B の既知の制約と同種）。

### 認証情報・鍵の所在
- Firebase クライアント設定: `.env`（gitignore済み。ローカルのみ）
- Gemini APIキー・Firebaseサービスアカウント秘密鍵: Cloudflareの Secret（`wrangler secret put GEMINI_API_KEY` / `FIREBASE_SERVICE_ACCOUNT`）。リポジトリ・クライアントには一切置かない
- gh（GitHub CLI）アクティブアカウント: `KierkegaalL`（同一マシンに `ryujioku-init` も登録されているため、push/PR前に毎回 `gh auth status` で確認する運用）
- git commit の Author/Committer: 両方とも `Ryuji Oku <27954563+KierkegaalL@users.noreply.github.com>`（GH007回避のため、リポジトリのローカル`user.email`は実アドレスで使えない。`-c user.name=`/`-c user.email=` と `GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` を同時指定）

## 完了済み作業 / 残タスク

### ✅ 完了したもの（Phase 0〜4、主要機能）
- ハーネス整備（CLAUDE.md・hooks・rules・skills 雛形）
- 4ステップ日記フロー（きもち→できごと→ことば→たしかめる→灯）・Orbのreanimated移行・段階演出
- Firebase 匿名認証・Firestore永続化（Phase2）、下書きのオフライン永続化（draftStore）
- Phase2 AI連携（Cloudflare Worker + Gemini、LLMプロバイダ抽象化）
- Phase3 QRペアリング（`createPairingToken`/`verifyPairingToken`、Firebaseサービスアカウント自前JWT署名）
- generateInsight（週次/月次/**過去3ヶ月**まとめ・オンデマンド生成+キャッシュ。過去3ヶ月タブは週別感情推移グラフ＝`weeklyBreakdown`も実装済み＝コミット1a17a92）
- deleteAccount（Worker側API実装・実疎通確認済み。UI導線も実装済み＝コミット6b21e88）
- Web ダッシュボード一式（`web/`）: 振り返り画面・日記本文閲覧（`/entries`・検索/無限スクロール）・カメラQRライブ読取・Apple/Googleサインイン代替（Web側）・Firebase Hostingデプロイ設定
- モバイル: 匿名→Apple/Googleリンク昇格ロジック（`linkWithCredential`・`AuthLinkError`写像・`WebConnectScreen`導線）
- モバイル: **ネイティブ資格情報取得の実装**（`nativeCredentialSource.ts`＝中核ロジック・`nativeCredentialSourceInstall.ts`＝実モジュール束ね。Apple: `expo-apple-authentication`+`expo-crypto`のnonceフロー、Google: `@react-native-google-signin`）。**起動エントリでの `installNativeCredentialSource()` 呼び出しも配線済み**（`index.ts`→`nativeAuthBootstrap.ts`の`bootstrapNativeCredentialSource()`。`EXPO_PUBLIC_ENABLE_NATIVE_AUTH=1`時のみ`nativeCredentialSourceInstall`を動的requireして呼ぶ＝Expo Goではネイティブモジュール未評価で起動が壊れない）。実機疎通確認は開発ビルドが要るためユーザー実施待ち

- **設定画面のアカウント削除UI**（コミット6b21e88、`develop`へマージ済み）: `DeleteAccountSection`を追加。画面内2段階確認→`deleteAccount()`→`entriesStore.teardown()`→`authStore.signOut()`（新匿名セッション確立）→Home遷移。reviewerが「旧uidデータの一瞬残留」「signOut失敗をdeleteAccount失敗と誤表示」の重大指摘2件を発見→修正（`authStore.signOut()`をrethrow化、entriesStore即時クリア）
- **設定画面「バックアップする」行の実装**（PR #42）: ユーザーへ方針確認のうえ、WebConnect画面（既存のAccountLinkSection）へ遷移する行を追加。実装過程で「連携不可環境（既定のExpo Go等）で押しても何も起きない」バグをreviewerが発見→`useLinkableAccountKinds`（新規フック）でWebConnectScreenと判定を共有し、連携可能な場合のみ行を表示するよう修正
- **設定画面へのWebConnect統合**（PR #46・`develop`へマージ済み）: 「Webで見る」「バックアップする」の2行が同じWebConnect画面に着地し区別がつかないとのユーザー指摘を受け、旧`WebConnectScreen`（QR表示＋`AccountLinkSection`）を`SettingsScreen`へ直接統合しファイル自体を削除（`RootNavigator`/`navigation/types.ts`からもルート削除）。アカウント削除セクションはWeb連携セクションの下に配置、`ScrollView`でラップ。`docs/screen.md`（3.9/3.10統合）・`docs/architecture.md`・`docs/design/basic-design.md`・`docs/api-contract.md`・`web/README.md`・`environments.md`のWebConnect参照を更新。reviewer一次チェックでdocs修正漏れ5件、二次チェックで追加2件を指摘→修正済み
- **設定画面のWeb版QR非表示化**（同PR #46・追加コミット）: `SettingsScreen`をExpo Webでブラウザ表示した場合、「パソコンで読み取るQR」をパソコン上に表示してしまう自己矛盾に気づいたユーザー指摘を受け、`WebConnectSection`を`Platform.OS === 'web'`で分岐。Web版はQR発行ロジック（`QrPairingBody`、ネイティブのみ）を呼ばず、代わりにWebダッシュボード（`web/`の`/connect`。カメラQR読取は実装済み）への案内（`WebDashboardNotice`。`EXPO_PUBLIC_WEB_URL`設定時はリンク付き）を表示。カメラスキャナの二重実装を避ける方針
- **モバイルのWeb版（Expo Web）に連携ゲート＋設定画面の連携/ログアウト行を実装**（`feature/mobile-web-connect-gate`、PR #53・**`develop`へマージ済み**）: 直後の「Webに`/settings`新設」（PR #52）を実機確認したユーザーから、「対象はモバイルアプリ自体のExpo Webビルド（`expo-web`、ポート8082等）だった」と訂正を受け、`web/`側ではなく`src/`（モバイル）側にPlatform.OS==='web'限定で作り直した（`web/`・モバイルのネイティブ挙動には一切手を入れていない）。
  - `authStore`に`'needs-connect'`ステータスを追加。`Platform.OS==='web'`かつFirebase設定済みで既存セッションが無い場合のみ自動匿名サインインを止め、`App.tsx`が`RootNavigator`の代わりに連携ゲート（`src/screens/webConnect/WebConnectGate.tsx`）を表示する。
  - ゲートは4導線: ①QRカメラ読取（`QrCameraScanner.tsx`。RNには`<video>/<canvas>`が無いため`View`のrefから実DOMノードを取得し`getUserMedia`+`jsQR`で実装。`web/`のQrScannerと同じ方式）②コード貼り付け（`src/services/pairing.ts`に`extractPairingToken`/`signInWithPairingToken`を追加。Worker`/verifyPairingToken`を`requireAuth:false`で呼ぶため`callClaudeWorker`にオプション追加）③Googleサインイン（`src/services/auth/webOAuth.ts`。`signInWithPopup`）④「サインインせずに利用する」（匿名サインイン、あとから設定で連携可）。
  - 設定画面（`SettingsScreen`のWeb版分岐）に`WebAccountRow`を追加。`user.isAnonymous`（`AuthUser`型に新規追加）で「スマホと連携する」/「ログアウトする」を出し分け、`authStore.requestWebConnect()`（サインアウト+ゲートへ戻す）を呼ぶ。
  - **実機確認で発見・修正したバグ**: `WebConnectGate`が`SafeAreaView`を使うが`AppProviders`（`SafeAreaProvider`）の外で描画しており`ForwardRef`エラーでクラッシュ→`App.tsx`で`<AppProviders><WebConnectGate/></AppProviders>`に修正。ブラウザで実際にゲスト利用→Home→設定→「連携する」→ゲートへ戻る、の一連を確認済み（カメラ・Google実サインイン・実QRペアリングは自動テスト環境の制約で未検証）。
  - **reviewerチェックで発見・修正した追加5件**: ①`signInWithGoogleWeb`が`browserPopupRedirectResolver`を明示せず実ブラウザで失敗する懸念→第3引数に明示指定、②`QrCameraScanner`の`useEffect`依存に`onDecode`を含めていたため親の再レンダーでカメラが不要に再起動→`onDecodeRef`（ref＋別effectで更新）に変更しマウント時のみ起動、③`localAuthProvider`（Firebase未設定時）が`isAnonymous`を設定せず`WebAccountRow`が「連携済み」と誤表示しうる→`isAnonymous: true`を明示、④`authStore.initialize()`のcatchフォールバック（Firebase例外時）がWeb版ガードを迂回しうる→フォールバック内にも`Platform.OS==='web' && isFirebaseConfigured`ガードを追加、⑤`WebAccountRow`と既存`WebDashboardNotice`（web/への案内）が並存し混乱→順序入替＋文言調整（前者「このブラウザをそのまま使う」・後者「分析・検索など別アプリの機能を使う」に役割整理）。`docs/screen.md`未更新の指摘も反映（新設§3.10・§0.1画面一覧・§3.9実装メモ）。テスト12件（authStore9+pairing7+SettingsScreen5、うち新規は差分）追加・型チェック/lint/全155テスト通過。`docs/architecture.md`（認証プロバイダ節）・`docs/api-contract.md`（5.2節）・`docs/screen.md`（§0.1・§3.9・新設§3.10）更新。
  - **残タスク（軽微・reviewer指摘）**: `QrCameraScanner.tsx`（モバイル）と`web/src/components/QrScanner.tsx`（Web）でQRカメラ読取ロジックがほぼ同一で二重実装。`shared/`への切り出し余地あり（優先度低・スコープ外）。`docs/design/basic-design.md`が「モバイル＋Webダッシュボード」の2クライアント構成のままで、今回追加した3つ目の面（モバイルのExpo Webビルド自体の連携ゲート）を反映していない（未対応）。
  - **マージ後の見た目修正（追加コミット、PR #53に含めて`develop`へ反映済み）**: ユーザーからの2点の指摘に対応。①連携ゲート（`WebConnectGate.tsx`）を`web/`の`/connect`（`CenteredCard`）と同じ白枠カードで囲み、「サインインせずに利用する」はカード外に配置。②設定画面の`WebAccountRow`（「スマホと連携する」／「ログアウトする」）を、独自レイアウト＋別ボタンから「アカウントを削除する」と同じ`SettingsRow`（行全体タップ）に変更し、その直上（`DeleteAccountSection`の直前）に配置。この過程でreviewer指摘（連打防止ガードが無い）に対応してテストを追加したところ、`busy`を`useState`で管理していたためstale closureで連打時に`requestWebConnect`が2回発火する実バグを発見→`useRef`（`busyRef`）による同期ガードに修正。同様の連打脆弱性（busy stateのみでrefガード無し）が`AccountLinkSection`（Apple/Google連携ボタン）にも理論上残っている（reviewer指摘・参考情報、対応必須ではない）。型チェック・lint・全156テスト通過、reviewerチェックループ2周（各回指摘を都度解消）で最終0件。
- **Webに`/settings`新設（日記一覧側の導線）**（PR #52・**クローズ済み・未マージ**）: 当初「`/entries`前にも連携画面を挟む＋ゲスト利用可＋`/dashboard`に設定画面」という構成で実装したが、実機確認したユーザーから訂正指示: ①`/connect`のゲスト（サインインせず利用する）機能は不要、元の接続画面のまま、②設定画面は`/dashboard`ではなく`/entries`（日記一覧＝「日記側」）に紐づける、③モバイルには一切手を入れない（モバイルは既に「Webで見る」「バックアップする」「アカウント削除」を提供済みで役割重複と認識済みのうえで、Web単独機能として追加）。訂正を受け、前回の`web/`変更（`/connect`のゲスト機能・`/dashboard`への設定リンク等）を`git reset --hard`で一旦完全破棄し作り直し。最終形: `web/src/app/settings/page.tsx`（新規。未サインイン時`/connect`へリダイレクト、`user.isAnonymous`で「スマホと連携する」／「ログアウトする」を出し分け、その下にアカウント削除2段階確認）＋`web/src/lib/account.ts`（新規。モバイルの`src/services/account.ts`と対称的なWorker`/deleteAccount`クライアント）＋`web/src/app/entries/page.tsx`のヘッダーに「設定」リンク追加のみ（`/connect`・`/dashboard`・モバイルは無変更）。reviewer二次チェックで「作業ブランチ名が旧コンセプトのまま」の指摘を受けブランチ名を`feature/web-entries-settings`に変更。型チェック・`next build`（7ページ静的生成）通過。**その後、不要な機能だったためユーザーによりPR自体がクローズされた（再着手不要・2026-07-13ユーザー確認済み）**。
- **設定画面Web版の文言・導線修正**（PR #49・`develop`へマージ済み）: 上記Web版導線について、①ダッシュボードへの遷移がテキストリンク（`styles.linkOk`のPressable）で目立たず「ボタンが見つからない」と指摘→`PrimaryButton`（label「Webダッシュボードを開く」）に変更、②ネイティブ向け副題「Web連携・バックアップ」と注記「スマホの日記データはそのまま、安全に保たれます」がWeb版でも無条件表示され内容と噛み合っていない（QR/バックアップがスマホ側で完結する前提の文言のため）と指摘→`SettingsScreen`の副題を`Platform.OS === 'web'`のときのみ「Webダッシュボードへの案内」に、注記も同条件で非表示に変更。**ネイティブ側の表示・文言は一切変更していない**（ユーザーからモバイル版に手を入れないよう明示指示あり）。テスト2件追加・型チェック/lint/全141テスト通過。**`EXPO_PUBLIC_WEB_URL`はローカル`.env`に`http://localhost:3000`を設定済み**（`web/.env.local`もモバイルの値から転記して作成し、Web ダッシュボード側もFirebase接続済み。ボタン表示・実データ確認とも可能な状態）
- **WebのAppleサインインボタン無効化**（PR #50・`develop`へマージ済み）: Appleサインインは有料Developer Program未加入のため現状未実装（`environments.md`）。`web/src/app/connect/page.tsx`のAppleボタンを`disabled`にし、注記に「今後対応予定」の文言を追加。`aria-disabled`の冗長付与をreviewer指摘で削除
- **過去日記一覧の仮想化**（PR #41）: `CalendarScreen`のリストモードを`ScrollView`+`.map()`から`SectionList`（`VirtualizedList`ベース）へ書き換え、constraints.md「リスト表示は仮想化」要件を充足。`EntryRow`を`React.memo`化・`onOpen`を`useCallback`で安定化
- **entries.source/adjustments の追跡実装**（PR #40）: `entries.source`（生成モデル/プロンプト版）・`entries.adjustments`（適用調整の履歴）を`DiaryEntry`型・保存処理に実装。worker側`handleGenerateDiary`/`handleAdjustDiary`にモデルID返却を追加、保存ロジックは`buildDiaryEntry.ts`へ純粋関数として切り出し。実装過程で「↻選び直す」時に`PreviewScreen`が再マウントされず古い調整結果が持ち越されるバグを発見・修正（React公式のレンダー中state調整パターン）。`docs/api-contract.md`のモデル名記述漏れ（`claude-sonnet-5`残存）も併せて修正
- **docsとの整合チェック**（2026-07-11）: 実装×設計書（api-contract.md/architecture.md/data.md/screen.md）を全面照合し、下記の残タスクを確定

直近PR: #53（モバイルWeb版連携ゲート＋見た目修正追加コミット、`develop`へマージ済み）・#52（Web `/entries`側設定画面新設、**クローズ・未マージ**）。それ以前（すべて`develop`へマージ済み）: #50（Web Appleサインイン無効化）・#49（設定画面Web版文言修正）・#48（wordsKey/chatOpening重複解消）・#47（オフライン保存タイムアウト）・#46（設定画面WebConnect統合）・#45（ネイティブ資格情報運用配線）・#44（Cron事前生成）・#43（低優先度残タスク4件）・#42（設定画面バックアップ行）・#41（過去日記一覧の仮想化）・#40（entries.source/adjustments）。

### 残タスク（2026-07-11 実装×設計書 整合チェックで確定。新規発見分は全てPR #40〜#42で解消）

**docsに明記済みの正式な残タスク**（2026-07-11、ユーザー承認のもと実現可能な4件に着手中。設計判断/開発ビルドが必要な3件は次回以降へ）
- [x] 設定画面のアカウント削除UI → **完了**（コミット6b21e88）
- [x] Gemini再試行の最大待ち時間の再検討 → **完了**（コミット9298b02。`REQUEST_TIMEOUT_MS`を`Record<LlmPurpose, number>`化し用途別に分離：interactive=15秒/generate=20秒、最大待ち時間はinteractive≒30.6秒・generate≒40.6秒。reviewer指摘＝共通タイムアウトだとgenerate側のdeadline-exceeded率が上がるリスクを踏まえた設計）
- [x] chatのサーバ側文脈補完 → **完了**（コミット658a1d0＝当日分。`entryId`から`getEntry`＝`worker/src/firestore.ts`で当日の`mood`/`bodyText`のみ`mask.fieldPaths`で取得し`system`プロンプトへ注入。`history`切り詰めの影響を受けない。取得失敗・entryId不正時は文脈補完なしにフォールバックし対話継続。**関連する過去エントリの要約補完も完了**（2026-07-13、`chore/chat-past-trend-summary`）: `getEntry`に`date`を追加し（当該エントリのローカル日付）、これを起点に直近14日間（当日を含まない）を既存の`queryEntriesByDateRange`（3.5節・insight.ts用と共用）で取得、`insight.ts`の`aggregate()`をそのまま再利用して気分割合・頻出語（上位5語）のみを`system`プロンプトへ追加注入する`buildPastTrendNote`（`worker/src/index.ts`）。**日記本文は一切取得・送信しない**（`queryEntriesByDateRange`は元々date/mood/wordsのみ射影）。過去エントリ3件未満・`entry.date`取得不可・集計クエリ失敗はいずれも傾向ノートなしで対話継続（当日分と同じフォールバック方針）。`SYSTEM_CHAT`に「数値をそのまま読み上げず参考程度に」の指示を追記。`chatOpening`には未適用（api-contract.md 3.4備考のスコープがchat限定のため、スコープ外として明記）。`docs/api-contract.md`3.4節・第10章を更新。テスト追加（firestore.test.ts: date欠落null化1件・既存2件へdate追加、chat.test.ts: 傾向ノート8件新規。うちreviewer指摘で追加した全件mood:null時の表示ガード＝moodPart省略・moodPart/wordsPart両方無ければノート自体を返さない、のテスト2件を含む）で worker 156件全通過・型チェック通過。reviewerチェックループ2周（各回軽微指摘のみ→修正）で最終0件）
- [x] 「過去3ヶ月」タブの感情推移グラフが単一積み上げバーのまま（週別内訳は未実装）→ **完了**（コミット1a17a92。`worker/src/insight.ts`に`aggregateWeekly`を追加、`type=quarterly`のみISO週（月曜始まり）ごとの百分率`weeklyBreakdown`を算出しキャッシュ（`InsightDoc`）に含める。エントリの無い週も0件として含め推移の空白を可視化。weekly/monthlyタブは期間が短いため従来どおり単一バーのまま。Webは`WeeklyMoodChart`（新規）で週別バーを表示、`MoodChart`は単一バー用に維持。**実データでのブラウザ確認は未実施**＝web/.env.localが未設定でFirebase未接続のため。型チェック・ユニットテスト（週境界を実際にnodeで計算し検証済み）・reviewerチェックは通過済み）
- [x] generateInsightの定期事前生成（Cron Triggers）→ **完了**（コミットd5ab99a・`feature/cron-pregenerate-insights`・PR #44・developへマージ済み）。`worker/src/cron.ts`（`handleScheduled`）を新規実装し `index.ts` の `scheduled` に配線、`wrangler.jsonc` に `triggers.crons ["0 15 * * *"]`（00:00 JST）。現在期間の weekly/monthly まとめを事前生成しキャッシュを温める（best-effort、正はオンデマンド）。**設計課題「全ユーザー列挙のコスト・権限」への回答**: `users/{uid}` はクライアントが本体を書かず missing document になるため `listUserIds`（`worker/src/firestore.ts`）は `showMissing=true` 付き list documents で列挙・`mask` で本文非読・`CRON_MAX_USERS`（既定20）で件数制限。**JST/UTCズレバグ**（cron発火は15:00 UTC＝00:00 JSTで、UTCのままだと月/週境界直後に1つ古い期間を対象にする）をreviewer指摘で発見し、`handleScheduled`で`scheduledTime + 9h`のJST壁時計で算出するよう修正。`pad2`/`DAY_MS`/`toDateString`は`worker/src/dateUtils.ts`へ共通化。reviewerチェックループ（初回7件→再チェック0件）通過・型チェック・テスト143件パス
- [x] ネイティブ資格情報取得の運用配線・実機疎通確認 → **完了**（`index.ts`→`nativeAuthBootstrap.ts`。`EXPO_PUBLIC_ENABLE_NATIVE_AUTH=1`のときだけ`installNativeCredentialSource()`を動的require。「Expo Goを壊さない配線」課題は、ネイティブモジュールを静的importせず遅延require＋envフラグゲートで解決）。**iOS実機でGoogle連携の疎通確認まで完了**（PR #45）。詰まりどころ7件の詳細は上記「最終更新」および下記「iOS 開発ビルド作成時の既知の詰まりどころ」参照。Apple連携は有料Developer Program未加入のため未検証のまま（方針どおりスキップ）
- [x] Firestoreオフライン永続化（JS SDK制約内での緩和策）→ **完了**（`fix/preview-offline-save-timeout`）。RNではFirebase JS SDKがIndexedDB不在でメモリキャッシュ中心のため、オフライン中の`setDoc`Promiseはオンライン復帰まで解決しない（＝ハングする）ことを実装調査で確認。`PreviewScreen`の保存ボタンをオフライン中は無効化して書込自体を開始せず、送信中に回線が切れた場合は15秒タイムアウト（`withTimeout`）でエラー表示に倒すよう修正。あわせて「オフラインなら生成済み本文ごと非表示にする」既存の描画順バグ（`display`より`isOffline`分岐が先に評価され、生成成功後にオフラインへ転じると保存ボタンごと消えていた）を発見・修正し、`display`優先の描画順に変更。下書き（`draftStore`）はいずれの場合も保存成功（「灯」演出後の`reset()`）まで保持されるため再試行可能。reviewer一次チェックで重大2件（タイムアウト後も裏で生存する前回書込との競合により1日1件制約が別IDの重複保存で破られうる／アンマウント後のsetStateガード欠如）・中2件（NetInfo判定中`null`をオンライン扱いしていた／`onAdjust`に`isOffline`ガードがなく`onSave`と非対称）・軽微3件を指摘→全て修正（`writeInFlight`状態で前回書込の決着まで再送禁止、`isMountedRef`でアンマウント後のsetStateをガード、`isOffline`を`!== true`判定に変更、`onAdjust`にも`isOffline`ガード追加、`saving`中は`isOffline`案内文を出さないよう優先順位調整）。`docs/architecture.md`第7章・`docs/data.md`第8章を実装に合わせて更新（従来の「ローカルキューに積まれ自動同期」という記述はJS SDKの実際の挙動と乖離していたため訂正）。**完全な永続化（アプリ強制終了後も保存を維持）には`@react-native-firebase`（ネイティブ）への移行が引き続き必要**（大規模移行のため次回以降）。テスト4件追加（オフライン無効化・タイムアウト・重複保存防止・アンマウント時無害化）・型チェック/lint/全テスト140件通過

**軽微な所見 → 両方とも完了**（`fix/wordskey-chatopening-parity`）
- [x] `PreviewScreen.tsx`の`wordsKey`算出式と`useDiaryGeneration.ts`の`key`算出式の重複（reviewer所見、PR #40）→ **完了**。`src/utils/diaryWords.ts`に`wordsKey(words)`として共通化し両ファイルから参照
- [x] `handleChat`と`handleChatOpening`の取得経路の非対称（reviewer所見、コミット658a1d0）→ **完了**。`handleChatOpening`（`worker/src/index.ts`）を`handleChat`と同じ方針に統一：`entryId`があれば`getEntry`でサーバ側から`mood`/`bodyText`を再取得し、クライアント送信値は取得失敗時のフォールバックにのみ使用。クライアント側`chatOpening`に`entryId`パラメータを追加（`diaryApi.ts`/`diaryApi.functions.ts`/`diaryApi.mock.ts`/`DetailScreen.tsx`）。`worker/src/__tests__/chatOpening.test.ts`新規（4テスト）、`docs/api-contract.md`更新。型チェック/lint/テスト（ルート140件・worker147件）通過、reviewerチェック指摘0件
- 作業中、`git stash pop`の競合解決を誤り古いコミットをベースにしてしまうミスが発生→`develop`（PR #47マージ後）から作業ブランチを作り直して解消（誤って不要になったローカル追跡ブランチ`feature/phase4-delete-account`を削除したが、リモートは現存のため実害なし）

2026-07-11の整合チェックで発見した新規タスクは全て解消済み（PR #40〜#42）。docs記載済みの低優先度残タスク4件のうち実現可能な4件全てが完了（`chore/remaining-low-priority-tasks`ブランチ＝PR #43）。Cron事前生成（PR #44）・ネイティブ資格情報の運用配線とiOS実機Google疎通確認（PR #45）・モバイルWeb版連携ゲート（PR #53）も完了。

### 現時点（2026-07-14）で残っている実質的なタスク
1. **Firestoreオフライン永続化のネイティブ移行**（`@react-native-firebase`への移行）: 設計（[docs/migration-react-native-firebase.md](docs/migration-react-native-firebase.md)、7フェーズ分割）に沿って**全7フェーズ完了**。**Phase1/2/2.5/3-4/5 = develop マージ済み／Phase6 = PR #61（レビュー済み・指摘0件・実機検証成功・マージはユーザーが実施予定）／Phase7 = 判断完了（スコープ縮小）**。
   - **✅ Phase2（Worker `/migrateToNativeAuth`）＋Phase2.5（`getIdToken`のプロバイダ非依存化）= PR #56（developマージ済み）**: `worker/src/migration.ts`新設（`mintCustomToken`を再利用し確立済みuidに同一uidのカスタムトークンを発行）＋ルート追加＋テスト、`docs/api-contract.md` §5.5追記。`AuthProvider`に`getIdToken()`を追加（`firebaseAuthProvider`＝`currentUser.getIdToken()`／`localAuthProvider`＝throw）、`claudeWorker/client.ts`を`getAuthProvider().getIdToken()`経由へ変更。
   - **✅ Phase1（依存追加・config plugin配線）= PR #57（developマージ済み）**: `@react-native-firebase/app`・`/auth`・`/firestore` v25.1.0 追加。`app.config.ts`が`EXPO_PUBLIC_USE_NATIVE_FIREBASE`（`1`/`true`）有効時のみ`@react-native-firebase/app`+`/auth`のconfig pluginと`ios/android.googleServicesFile`を注入（`firestore`はconfig plugin無し／パスは`EXPO_PUBLIC_GOOGLE_SERVICES_PLIST`・`_JSON`で上書き可・既定ルート直下）。`.gitignore`に`GoogleService-Info.plist`/`google-services.json`追加、`.env.example`/`environments.md`に手順追記。**ユーザーが`GoogleService-Info.plist`/`google-services.json`を配置済み**。**✅ `useFrameworks:'static'`×`@react-native-firebase`のpod install実機検証も完了**: Phase1〜6の開発ビルド（`pod install`＋Xcode Run）で問題なく通ることを確認済み（追加のPodfile設定は不要だった。移行計画書第9章は解決済みとして整理）。
   - **✅ Phase3-4（ネイティブ認証プロバイダ＋uid継続ブリッジ）= PR #58**（レビュー中・base develop・reviewer指摘0件・176テスト通過）: `src/services/firebase/nativeFirebaseFlag.ts`（`shouldUseNativeFirebase`＝フラグ判定・Web常時無効）、`src/services/auth/nativeFirebaseAuthProvider.ts`（ネイティブ非依存コア＝移行ブリッジ本体。`init()`内で「移行済み→ネイティブ復元／未移行＋既存JS uid→JS復元→Worker `/migrateToNativeAuth`でカスタムトークン→`signInWithCustomToken`／新規端末→直接匿名」を`await`完結。第9章フォールバック＝ブリッジ失敗時はネイティブへ切替えず現行JS経路維持＋フラグ立てず次回再試行、js-fallback中は`getIdToken`/`signOut`をJS側へ委譲）、`nativeFirebaseAuthProviderInstall.ts`（実`@react-native-firebase/auth`・`firebaseAuthProvider`・Worker・AsyncStorageの束ね＝動的requireのみ）、`getAuthProvider()`にネイティブ分岐、`callClaudeWorker`に`idToken`明示指定オプション追加（ブリッジの自己再帰防止）。テスト3本。**✅ 既存uid継続の実機検証（最重要・§8）はユーザーが完了・成功**（Xcode Run＋開発ビルド、iOS実機。移行前に作成したuid `bIygQ8BhdxZ2dahihu1CCVXY7iW2` が、フラグ有効化後の初回起動（ブリッジ実行）・2回目起動（移行済みフラグでのネイティブ復元のみ）のいずれでも維持され、保存済み日記データも表示され続けることを確認。実機検証中「Xcodeから直接RunするとMetro未起動でNo script URL providedになる」「Gemini無料枠gemini-3.5-flashのRPD(1日20件)超過で日記生成が429/504失敗」の2つの環境要因に遭遇したが、いずれもコードのバグではなく解決済み）。本PR単体でフラグ有効化すると認証=ネイティブ・Firestore=JS SDKになる（ブリッジ後もJSセッションを残すため同一uidで整合。実運用の有効化はPhase6完了後を推奨）。
   - **✅ Phase5（Apple/Googleリンク昇格）= PR #59（developマージ済み）**: `nativeFirebaseAuthProvider.ts`の`linkWith`に、`NativeAuthBinding`へ追加した同期の`getCurrentUser()`でセッション有無・匿名判定を**先に**行ってから（js-fallback中は`jsProvider.linkWith`へ委譲）、`nativeCredentialSource.ts`（既存のネイティブ非依存DIシーム）経由で資格情報取得→`nativeFirebaseAuthProviderInstall.ts`の`linkWithCredential`（`auth.GoogleAuthProvider.credential`/`new auth.OAuthProvider('apple.com').credential`）を実装。**reviewerチェックで2件の不具合を発見・修正済み**: ①順序バグ＝当初は資格情報取得（ネイティブのGoogle/Appleサインイン画面表示）を先に行っていたため、セッション無し／既にリンク済みでも画面を最後まで完了させてから弾く不具合があった→`getCurrentUser()`による事前チェックを先に行う順序へ修正。②**Apple向け`credential()`の引数形式バグ（マージ前最終レビューで発見・重大）**＝`@react-native-firebase/auth`の型定義（`namespaced.d.ts`）は位置引数`(token, secret)`と宣言しているが、実際のランタイム実装（`lib/providers/OAuthProvider.ts`）はオブジェクト引数`{idToken, rawNonce}`を要求する（型定義側が実装と食い違っており`tsc`では検出不能）。位置引数のまま呼ぶとidToken/rawNonceがundefinedになり資格情報が空になる＝Appleサインインが実行時に静かに失敗する不具合だった→正しい引数形状のローカルinterfaceへ`as unknown as`キャストして呼ぶよう修正、回帰テスト追加。実機検証はGoogleのみ実施し成功（uid維持・Firestoreデータ維持・再起動後の復元・連携済み後のUI非表示を確認）。Apple実機検証は有料Apple Developer Program未加入のため保留（コード自体は上記修正によりApple/Google両対応）。マージ前最終191テスト通過。連携済み後も「Googleと連携」ボタンが再表示される別の不具合（`useLinkableAccountKinds`が`user.provider`固定文字列ではなく`isAnonymous`で判定すべきだった）も同PRで発見・修正済み。
   - **✅ Phase6（Firestoreネイティブリポジトリ実装）= PR #61（`feature/native-firebase-phase6-firestore`・base develop・reviewer2回チェックで指摘0件）**: `@react-native-firebase/firestore`のmodular API（`getFirestore`/`collection`/`doc`/`query`/`onSnapshot`等＝`firebase/firestore`とほぼ同じ関数シグネチャ）を使い`nativeFirestoreEntriesRepository.ts`/`nativeFirestoreMessagesRepository.ts`を新規実装、既存のJS SDK版とロジックを完全に揃えた（import元のみ差し替え）。`getEntriesRepository()`/`getMessagesRepository()`（`src/services/repository/index.ts`）に`shouldUseNativeFirebase()`分岐を追加、Authと同じフラグで揃ってネイティブ経路へ切り替わる。オフライン永続化はネイティブSDKの既定設定（`persistence: true`）で自動的に有効になるため追加設定不要。**1回目のreviewerチェックで2件の問題を発見・修正**: ①マージ済みのPhase5ブランチ上で作業してしまっていた（`develop`から新規ブランチ`feature/native-firebase-phase6-firestore`を切り直して解消）②`eslint-disable-next-line`のコメント位置が`require()`本体からずれており警告が抑制できていなかった（コメント位置を修正、`getAuthProvider.test.ts`と同じ手法の回帰テスト`repository/__tests__/index.test.ts`も追加）。なお同ディレクトリに以前から存在した無関係な未コミット変更（`wrangler.jsonc`/`package.json`の`wrangler`依存追加等・別作業の残骸）はPhase6コミットから意図的に除外。最終192テスト通過（32 suites）。**実機でのオフライン書込→復帰後自動同期の検証もユーザーが実施し成功**（機内モードだと保存ボタンがオフライン中は無効化され送信自体を開始できないため、iPhoneのWi-Fi設定「DNSを構成」→手動→`192.0.2.1`（到達不能な予約アドレス）に設定し、Wi-Fiには接続済み＝`NetInfo.isConnected`はtrueのまま・実際の通信は不可、という疑似オフライン状態を作って検証。①送信直後に疑似オフラインへ切替→アプリ生存のまま復帰、②送信直後に疑似オフラインへ切替→書込保留中にアプリを完全終了→復帰後に再起動、の両シナリオとも成功（ホーム/カレンダー画面への反映・Firestore側への同期を確認）。②はJS SDK版では復元できないケースで、ネイティブ移行の主目的である永続キューの効果を実証）。
   - **✅ Phase7（段階ロールアウト・旧経路の廃止判断）= 判断完了（スコープ縮小）**: TestFlight/Play Store配信が本セッション時点で未定（開発ビルドのみで運用）とユーザーに確認したため、当初想定の「社内配布→一部ユーザー→全体」の段階ロールアウトは対象ユーザーが存在せず実施対象外。代わりに①`.env.example`の`EXPO_PUBLIC_USE_NATIVE_FIREBASE`を空欄→`1`へ変更し開発/配布ビルドでの既定推奨値化（`environments.md`も同様更新。コード側`shouldUseNativeFirebase()`のフォールバック=falseはExpo Go保護のため変更せず）②旧JS SDK経路（`firebaseAuthProvider.ts`等）はWeb/Expo Go向けに削除せず維持、の2点に絞って対応（ユーザー確認済みの方針）。実際の段階ロールアウトはTestFlight/Play Store配信計画が具体化してから改めて着手（残タスク）。コード変更なし（`.env.example`/docs更新のみ）のためtypecheck/lintのみ確認、テストは対象外。
   - 設計背景（要点）: Firestoreのオフライン永続化にはネイティブAuth（`@react-native-firebase/auth`）への同時移行が必須（`firestore.rules`のuidスコープをネイティブSDKが満たすため）。最大リスクは既存匿名ユーザーのuid継続で、Workerの`mintCustomToken`を再利用したブリッジ（JS SDKのIDトークン検証→同一uidのカスタムトークン発行→ネイティブSDKへ`signInWithCustomToken`）で解決する。
2. **✅ 週別感情推移グラフ（過去3ヶ月タブ）の実データ確認 = 完了**: ブラウザコンソールで実行するスクリプト（Firebase JS SDKをCDNから動的import→`onAuthStateChanged`で既存のサインイン済みセッションのuidを取得→`users/{uid}/entries/seed-{date}`へ`setDoc`。Admin SDK・サービスアカウントキーは不要、Firestoreセキュリティルール（uidスコープ）の範囲内で書き込む方式をユーザーが選択）で過去95日分・3日おきのダミーエントリ（mood/words/bodyTextをローテーション）を投入し、ダッシュボードの「過去3ヶ月」タブで実データ確認に成功（スクリーンショットで確認: 14週分の週次バー・AIまとめ・言葉ランキングとも正しく描画。未来週（本セッション時点の「今日」より先）は0件のグレー表示となるのも`aggregateWeekly`の仕様どおりで正常。ダミーデータ以外の実日記データ（「イライラ」等）とも正しく合算集計されることも確認）。ダミーデータは`seed-`接頭辞のIDで投入したため、削除用スクリプト（同じ手法で`seed-`始まりのみ`deleteDoc`）も別途提供済み（残タスクではなくユーザーの任意タイミングでの後片付け）。
3. **✅ （優先度低・スコープ外）3件対応済み（`chore/qr-scanner-dedup-and-cleanup`・base develop・reviewerチェックで4件指摘→修正済み）**:
   - `QrCameraScanner.tsx`（モバイル）と`web/src/components/QrScanner.tsx`（Webダッシュボード、別npmプロジェクト）のQRカメラ読取ロジック（getUserMedia→canvas描画→jsQRデコードのrAFループ）二重実装を解消。npm workspaces等のモノレポ機構は無いが、既存の`shared/`ディレクトリ（`shared/theme/tokens.ts`等、`web/`は`@shared/*`パスエイリアス・`src/`は相対importで参照する既存の型/定数共有の仕組み）に乗せる形で新規`shared/qrScan.ts`（`runQrVideoScan()`）を作成し共通化。
   - `AccountLinkSection`（Apple/Google連携ボタン）に`WebAccountRow`と同様の`busyRef`連打防止ガードを追加、回帰テスト追加。
   - `docs/design/basic-design.md`をモバイル(ネイティブ)／モバイルのExpo Webビルド（`WebConnectGate`のみ追加）／Webダッシュボード（別プロジェクト`web/`・閲覧専用）の3クライアント構成に更新（第2.1/2.2/2.3節）。
   - **reviewerチェックで4件指摘**: ①②`architecture.md`への章番号参照ミス（実際はWebConnectGateの記述は第4.2節。第7章はオフライン同期の話で無関係）を修正、③`shared/qrScan.ts`のprettier未整形行を修正、④無関係な未コミット変更（`.gitignore`/`package.json`/`package-lock.json`/`wrangler.jsonc`）の混入注意→従来通りコミットから除外。
4. **✅ [Issue #60](https://github.com/KierkegaalL/tasogare-diary/issues/60) カレンダー月表示で日曜日の欄に日付が表示されない = 修正済み（[PR #63](https://github.com/KierkegaalL/tasogare-diary/pull/63)・`fix/calendar-sunday-cell`・base develop・reviewer2回チェックで指摘なし・マージはユーザーが実施予定）**: 原因は`CalendarScreen.tsx`のグリッドが`monthGrid()`のフラットな結果を単一`View`（`flexDirection:'row', flexWrap:'wrap'`）にmapし、各セル幅を`width:'${100/7}%'`という循環小数％で指定していたこと。Yogaのピクセル丸め誤差により7列の合計幅がコンテナ幅をわずかに超過し、7列目（月曜始まりのため日曜列）が次行へ折り返される（iOS実機のみ発生・Android/expo-webでは非発生という報告と整合）。修正は`monthGrid()`の結果を週（7要素・最終週は`null`パディング）ごとにチャンクし、各週を`flexWrap`非依存の明示的な行として描画する構造に変更、`cell`幅も`flex:1`へ統一（`monthGrid()`自体は無変更）。新規回帰テスト`CalendarGrid.test.tsx`（システム時刻を2026年5月に固定し月内の全日曜日3,10,17,24,31が週行の7番目に欠けず描画されることを検証）を追加。**reviewer1回目チェックでテストの日付事実誤認（2026-08-01/31を日曜と誤認していたが実際は土曜/月曜）を発見・修正**（2026年5月の実際の日曜日ベースへ全面書き直し）。

### 2026-07-14 全体レビュー（reviewer 3並行起動: モバイルsrc/・worker+web・ドキュメント全体整合）で発見した残タスク

> 従来の残タスクが全て完了したチェックポイントで、ユーザー依頼によりプロジェクト全体（`develop`最新・PR #65まで反映済み）の不具合・実装漏れ・整合性を棚卸しした。ユーザー指示により、コスト回避・Apple Developer Program関連は別枠（Bバケット）に分離し、Aバケット（真の残タスク）には含めない。

**A. バグ・実装漏れ・整合性（真の残タスク、未着手）**

*重大度 高*（2026-07-14 対応完了・PR作成済み）
- [x] `CLAUDE.md`「現在のフェーズ」節・ディレクトリ構成図が「ステップ1：ハーネス整備」のまま陳腐化（実際はPhase0〜4＋ネイティブFirebase移行Phase1〜7完了）。運用フェーズである旨・実際のディレクトリ構成（`worker/`/`web/`/`shared/`/`docs/design/`等）に全面更新した
- [x] `visual-design.html`（UIの正として複数docsが参照）がリポジトリに一度もコミットされておらず、ローカル（iCloud）にのみ存在していた問題。ユーザーのiCloud Drive（TextEditドキュメント）から実体を取得し `docs/design/visual-design.html` としてコミットした
- [x] [docs/screen.md](docs/screen.md) 画面一覧見出し「①〜⑬」が実際の`visual-design.html`の`.nav`（①〜⑪のみ）と不一致だった問題。⑨（旧「Webで見る(QR)」、2026-07-12改訂で⑧設定画面へ統合され廃止）を欠番として明記し、⑫⑬に「モックなし」の注記を追加した
- [x] [docs/design/basic-design.md](docs/design/basic-design.md) §3.1 画面一覧表に⑫（Web日記一覧）・⑬（スマホと連携）が欠落していた問題。表に追加した

*重大度 中*（2026-07-14 対応完了・PR作成済み）
- [x] オフライン判定（`useNetInfo().isConnected`）が画面間で不統一だった問題。新規`src/hooks/useIsOffline.ts`（`isConnected !== true`＝判定中も安全側でオフライン扱い）へ統一し、`PreviewScreen.tsx`/`WordsScreen.tsx`/`DetailScreen.tsx`/`SettingsScreen.tsx`すべてから使うよう変更した
- [x] `firestoreEntriesRepository.ts`/`nativeFirestoreEntriesRepository.ts`/`firestoreMessagesRepository.ts`/`nativeFirestoreMessagesRepository.ts`の`onSnapshot`エラーハンドラが`error.message`を素通しログしていた問題。`error.code`のみログするよう修正（ネイティブ版は型上`code`を持たないため`(error as {code?:string})`でキャスト）
- [x] Firestore/ネイティブFirestoreリポジトリの1日1件（U-11）担保upsertロジックに単体テストが皆無だった問題。`firestoreEntriesRepository.test.ts`/`nativeFirestoreEntriesRepository.test.ts`を新規作成（新規作成/既存上書き/createdAtフォールバックの3パターン）
- [x] `worker/src/cron.ts`の`CRON_MAX_USERS`（既定20）×types×4サブリクエストが無料枠50を超過する計算ミスだった問題。`safeMaxUsers(configuredMaxUsers, typesCount)`を追加し、サブリクエスト予算（45）内へ動的に切り詰めるよう修正（既定設定では実質5ユーザー/回）
- [x] [docs/data.md](docs/data.md) §6の`pairings`セキュリティルールのサンプルコードが古い設計のままだった問題。実際の`firestore.rules`と完全一致するよう更新（コメント含め全文一致を確認済み）
- [x] [.claude/rules/environments.md](.claude/rules/environments.md) のdev/staging/prod Firebase環境分離の記述が実態と乖離していた問題。単一プロジェクト`tasogare-diary-project`のみ運用の実態を明記し、dev/staging/prodは「将来案・未構築」と明確に区別した
- [x] `worker/src/index.ts`（`handleSuggestWords`/`handleGenerateDiary`/`handleAdjustDiary`/`handleChat`/`handleChatOpening`）に文字列・配列長の上限検証が無かった問題。`MAX_TEXT_LENGTH`等の上限定数と`asStringArray`/`requireString`/`optionalString`/`assertMaxItemTextLength`ヘルパーで各フィールドを検証するよう追加
- [x] リポジトリ直下の`wrangler.jsonc`＋関連`package.json`スクリプトの残骸。ユーザー確認の結果「破棄する」を選択し、`.gitignore`/`package.json`/`package-lock.json`を元に戻し`wrangler.jsonc`を削除して解消済み

*重大度 低*（2026-07-15 対応完了・PR作成済み）
- [x] `worker/README.md`「アカウント削除UI未実装」記述が陳腐化していた問題。実装済み（`DeleteAccountSection`）である旨に修正
- [x] `src/services/account.ts`のコメントが「未実装」のまま陳腐化していた問題。実装済みである旨に修正
- [x] `WordsScreen.tsx`/`nativeFirebaseFlag.ts`のコメントが陳腐化していた問題（「モック」「将来」表現）。実態（isClaudeWorkerConfiguredによる自動切替／Phase6実装済み）に修正
- [x] `draftStore`の`moodLevel`/`setMoodLevel`がデッドコードだった問題。`DiaryDraft`型・ストア・テストから削除
- [x] `DetailScreen`の非同期チャット処理にアンマウントガードが無かった問題。`isMountedRef`パターン（`PreviewScreen`と同一）を追加
- [x] worker側で`history`のサーバ側切り詰めが無かった問題。`MAX_HISTORY_MESSAGES_TO_LLM=20`でLLMへ渡す直近件数を切り詰めるよう追加（クライアントの`HISTORY_LIMIT=6`だけに頼らない多層防御）
- [x] `generateInsight`の同時リクエストで重複生成が起きうる問題。同一`(uid,periodId)`の同時リクエストを1つのPromiseにまとめる`inFlightGenerations`を追加
- [x] `pairing.ts`: `mintCustomToken`失敗時に再試行不可になる問題。`mintCustomToken`→`consumePairing`の順に入れ替え、mint失敗時はトークン未消費のまま再試行可能に
- [x] `docs/screen.md`の`.dash-sidebar`記述がWeb実装と不一致だった問題。ヘッダーのみでサイドバー無しの実態に修正
- [x] `.claude/rules/features.md`のPhase定義表が粒度として古かった問題。ネイティブFirebase移行（別軸Phase1〜7）の注記を追加
- [x] マージ済みローカルブランチ37本を`git branch -d`で削除し、`git-workflow.md`にマージ後削除を促す一文を追記

*テストカバレッジ（参考・対応完了）*: `web/`にvitestを新規導入（`web/vitest.config.ts`）し、タイムゾーン依存のISO週計算を含む`period.ts`の単体テストを追加。QRスキャナ・無限スクロール・タブ切替の世代ガード・Google OAuthポップアップはブラウザAPI依存が大きいため引き続き手動確認のみで担保する方針を明記（`web/README.md`）。

**B. コスト回避・Apple Developer Program関連（意図的な既知の制約。バグではない・ユーザー指示によりAとは別枠管理）**
- Firebase Sparkプラン維持のためCloud Functions不採用、Cloudflare Workers経由（`worker/`）
- Claude API → Google Gemini APIへ変更（無料枠運用、U-12）。将来アプリが軌道に乗る／AI能力に不満が出た場合は有料APIへ戻す可能性あり（`worker/src/llm/`にプロバイダ抽象化済み）
- Gemini無料枠のRPD制限（`gemini-3.5-flash`等）により、モデルを一時的に切り替える運用が今後も発生しうる（実績: Phase3-4実機検証中に発生・完了後に元へ戻し済み）
- Apple Developer Program（有料）未加入のため: Apple実機検証が未実施（Googleのみ検証済み）／Web版のAppleサインインボタンが無効化されたまま（`web/src/app/connect/page.tsx`）／`EXPO_PUBLIC_APPLE_SIGNIN_ENABLED`フラグが既定オフ

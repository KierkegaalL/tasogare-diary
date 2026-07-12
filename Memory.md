# Memory — たそがれ日記 プロジェクト引き継ぎドキュメント

最終更新: 2026-07-12（ネイティブ資格情報取得の運用配線＝PR #45。**iOS実機でGoogle連携の疎通確認まで完了**。7件の詰まりを解消: ①`pod install`のAppCheckCore未モジュール化エラー→`expo-build-properties`の`useFrameworks: 'static'`、②無料Apple ID（Personal Team）でのSign in with Apple provisioning失敗→`EXPO_PUBLIC_APPLE_SIGNIN_ENABLED`フラグで既定無効化、③Googleネイティブサインインが`iosClientId`未指定でクラッシュ→`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`追加、④URL scheme未登録エラー（`app-1-...-ios-...`形式）→Firebase **iOS アプリ**のApp ID（`EXPO_PUBLIC_FIREBASE_IOS_APP_ID`。Webアプリの`EXPO_PUBLIC_FIREBASE_APP_ID`とは別物）から派生するURL schemeを`app.config.ts`の`withGoogleSignInAppIdUrlScheme`で追加登録、⑤`account.google.com`で404→`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`に④の派生URL scheme文字列を誤設定していたミスが原因（実際のOAuth CLIENT_IDに訂正）、⑥日記保存失敗（Worker再デプロイ漏れが原因、コード変更なし）、⑦Expo Webで`EXPO_PUBLIC_ENABLE_NATIVE_AUTH=1`設定時に`@react-native-google-signin`未実装でエラー→`nativeAuthBootstrap.ts`に`Platform.OS === 'web'`ガードを追加。診断のためcatch節に安全なログ（uid・本文・idToken等は含めずcode/name等のみ）を複数箇所で恒久化。reviewerチェックループ通過済み・push済み。develop側で先にマージされたgenerateInsightの定期事前生成（Cron Triggers・PR #44・コミットd5ab99a）を本ブランチへマージ済み）

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
- **Cloudflare Workers デプロイ**: `worker/` は `wrangler deploy`（`npm --prefix worker run deploy`）で手動デプロイ。Cron Triggers 等の定期実行は未設定（残タスク B-3）。

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

- **設定画面のアカウント削除UI**（コミット6b21e88、未push）: `DeleteAccountSection`を追加。画面内2段階確認→`deleteAccount()`→`entriesStore.teardown()`→`authStore.signOut()`（新匿名セッション確立）→Home遷移。reviewerが「旧uidデータの一瞬残留」「signOut失敗をdeleteAccount失敗と誤表示」の重大指摘2件を発見→修正（`authStore.signOut()`をrethrow化、entriesStore即時クリア）
- **設定画面「バックアップする」行の実装**（PR #42）: ユーザーへ方針確認のうえ、WebConnect画面（既存のAccountLinkSection）へ遷移する行を追加。実装過程で「連携不可環境（既定のExpo Go等）で押しても何も起きない」バグをreviewerが発見→`useLinkableAccountKinds`（新規フック）でWebConnectScreenと判定を共有し、連携可能な場合のみ行を表示するよう修正
- **設定画面へのWebConnect統合**（feature/native-credential-wiring・未push）: 「Webで見る」「バックアップする」の2行が同じWebConnect画面に着地し区別がつかないとのユーザー指摘を受け、旧`WebConnectScreen`（QR表示＋`AccountLinkSection`）を`SettingsScreen`へ直接統合しファイル自体を削除（`RootNavigator`/`navigation/types.ts`からもルート削除）。アカウント削除セクションはWeb連携セクションの下に配置、`ScrollView`でラップ。`docs/screen.md`（3.9/3.10統合）・`docs/architecture.md`・`docs/design/basic-design.md`・`docs/api-contract.md`・`web/README.md`・`environments.md`のWebConnect参照を更新。reviewer一次チェックでdocs修正漏れ5件を指摘→修正済み
- **過去日記一覧の仮想化**（PR #41）: `CalendarScreen`のリストモードを`ScrollView`+`.map()`から`SectionList`（`VirtualizedList`ベース）へ書き換え、constraints.md「リスト表示は仮想化」要件を充足。`EntryRow`を`React.memo`化・`onOpen`を`useCallback`で安定化
- **entries.source/adjustments の追跡実装**（PR #40）: `entries.source`（生成モデル/プロンプト版）・`entries.adjustments`（適用調整の履歴）を`DiaryEntry`型・保存処理に実装。worker側`handleGenerateDiary`/`handleAdjustDiary`にモデルID返却を追加、保存ロジックは`buildDiaryEntry.ts`へ純粋関数として切り出し。実装過程で「↻選び直す」時に`PreviewScreen`が再マウントされず古い調整結果が持ち越されるバグを発見・修正（React公式のレンダー中state調整パターン）。`docs/api-contract.md`のモデル名記述漏れ（`claude-sonnet-5`残存）も併せて修正
- **docsとの整合チェック**（2026-07-11）: 実装×設計書（api-contract.md/architecture.md/data.md/screen.md）を全面照合し、下記の残タスクを確定

直近PR: #42（設定画面バックアップ行）・#41（過去日記一覧の仮想化）・#40（entries.source/adjustments）・#39（ネイティブ資格情報取得）・#38（リンク昇格ロジック）・#37（過去3ヶ月タブ）。#42/#41/#40は2026-07-11時点でオープン、#39/#38/#37は`develop`へマージ済み。

### 残タスク（2026-07-11 実装×設計書 整合チェックで確定。新規発見分は全てPR #40〜#42で解消）

**docsに明記済みの正式な残タスク**（2026-07-11、ユーザー承認のもと実現可能な4件に着手中。設計判断/開発ビルドが必要な3件は次回以降へ）
- [x] 設定画面のアカウント削除UI → **完了**（コミット6b21e88）
- [x] Gemini再試行の最大待ち時間の再検討 → **完了**（コミット9298b02。`REQUEST_TIMEOUT_MS`を`Record<LlmPurpose, number>`化し用途別に分離：interactive=15秒/generate=20秒、最大待ち時間はinteractive≒30.6秒・generate≒40.6秒。reviewer指摘＝共通タイムアウトだとgenerate側のdeadline-exceeded率が上がるリスクを踏まえた設計）
- [x] chatのサーバ側文脈補完 → **完了（一部）**（コミット658a1d0。`entryId`から`getEntry`＝`worker/src/firestore.ts`で当日の`mood`/`bodyText`のみ`mask.fieldPaths`で取得し`system`プロンプトへ注入。`history`切り詰めの影響を受けない。取得失敗・entryId不正時は文脈補完なしにフォールバックし対話継続。関連する過去エントリの**要約**補完は未実装のまま＝`docs/api-contract.md`第10章に明記）
- [x] 「過去3ヶ月」タブの感情推移グラフが単一積み上げバーのまま（週別内訳は未実装）→ **完了**（コミット1a17a92。`worker/src/insight.ts`に`aggregateWeekly`を追加、`type=quarterly`のみISO週（月曜始まり）ごとの百分率`weeklyBreakdown`を算出しキャッシュ（`InsightDoc`）に含める。エントリの無い週も0件として含め推移の空白を可視化。weekly/monthlyタブは期間が短いため従来どおり単一バーのまま。Webは`WeeklyMoodChart`（新規）で週別バーを表示、`MoodChart`は単一バー用に維持。**実データでのブラウザ確認は未実施**＝web/.env.localが未設定でFirebase未接続のため。型チェック・ユニットテスト（週境界を実際にnodeで計算し検証済み）・reviewerチェックは通過済み）
- [x] generateInsightの定期事前生成（Cron Triggers）→ **完了**（コミットd5ab99a・`feature/cron-pregenerate-insights`・PR #44・developへマージ済み）。`worker/src/cron.ts`（`handleScheduled`）を新規実装し `index.ts` の `scheduled` に配線、`wrangler.jsonc` に `triggers.crons ["0 15 * * *"]`（00:00 JST）。現在期間の weekly/monthly まとめを事前生成しキャッシュを温める（best-effort、正はオンデマンド）。**設計課題「全ユーザー列挙のコスト・権限」への回答**: `users/{uid}` はクライアントが本体を書かず missing document になるため `listUserIds`（`worker/src/firestore.ts`）は `showMissing=true` 付き list documents で列挙・`mask` で本文非読・`CRON_MAX_USERS`（既定20）で件数制限。**JST/UTCズレバグ**（cron発火は15:00 UTC＝00:00 JSTで、UTCのままだと月/週境界直後に1つ古い期間を対象にする）をreviewer指摘で発見し、`handleScheduled`で`scheduledTime + 9h`のJST壁時計で算出するよう修正。`pad2`/`DAY_MS`/`toDateString`は`worker/src/dateUtils.ts`へ共通化。reviewerチェックループ（初回7件→再チェック0件）通過・型チェック・テスト143件パス
- [x] ネイティブ資格情報取得の運用配線・実機疎通確認 → **完了**（`index.ts`→`nativeAuthBootstrap.ts`。`EXPO_PUBLIC_ENABLE_NATIVE_AUTH=1`のときだけ`installNativeCredentialSource()`を動的require。「Expo Goを壊さない配線」課題は、ネイティブモジュールを静的importせず遅延require＋envフラグゲートで解決）。**iOS実機でGoogle連携の疎通確認まで完了**（PR #45）。詰まりどころ7件の詳細は上記「最終更新」および下記「iOS 開発ビルド作成時の既知の詰まりどころ」参照。Apple連携は有料Developer Program未加入のため未検証のまま（方針どおりスキップ）
- 【次回以降・大規模ネイティブ移行】Firestoreオフライン永続化（RN制約でメモリキャッシュ中心。`@react-native-firebase`ネイティブ移行が本格対応。当面はdraftStoreで下書き継続を担保）

**軽微な所見（任意対応・ブロッカーではない）**
- `PreviewScreen.tsx`の`wordsKey`算出式と`useDiaryGeneration.ts`の`key`算出式が同一ロジックを重複実装（reviewer所見、PR #40）。将来の変更漏れリスクはあるが現状は不具合なし。共通ユーティリティへの切り出しは任意
- `handleChat`（`getEntry`でサーバ側再取得・uidスコープ強制）と`handleChatOpening`（`data.mood`/`data.bodyText`をクライアントから直接信頼）で、同じ「その日の記録」の取得経路が非対称（reviewer所見、コミット658a1d0）。クライアントは自分の日記データしか持てないため実害は小さいが、将来`chatOpening`側も`entryId`起点のサーバ側取得へ揃える一貫性リファクタの余地あり

2026-07-11の整合チェックで発見した新規タスクは全て解消済み（PR #40〜#42）。docs記載済みの低優先度残タスク4件のうち実現可能な4件全てが完了（`chore/remaining-low-priority-tasks`ブランチ＝PR #43）。2026-07-12にCron事前生成も完了（`feature/cron-pregenerate-insights`・コミットd5ab99a・push/PR待ち）。残るは開発ビルド必須の2件（ネイティブ資格情報の運用配線・Firestoreオフライン永続化の本格移行）のみ。

# Firestoreオフライン永続化のネイティブ移行計画（`@react-native-firebase`）

> **ステータス: 設計のみ（未着手）**。本ファイルはコード変更を伴わない移行計画書。実装に着手する際は、本ドキュメントをベースに `TaskCreate` でフェーズ単位のタスクへ分解してから進める。
>
> 関連: [architecture.md 第7章](architecture.md)（オフライン・同期アーキテクチャ）／[environments.md](../.claude/rules/environments.md)（Firebase クライアント設定・ネイティブ資格情報）／[constraints.md](../.claude/rules/constraints.md)（オフライン対応要件）

## 1. 背景・目的

現状、Firebase JS SDK は React Native 上で IndexedDB を使えず、Firestore のオフライン永続化はメモリキャッシュ中心になる（`experimentalForceLongPolling` で接続は維持できるが、ローカル永続キューは持たない）。そのため **アプリがオフライン中に発行した書込は、オンライン復帰までハングし、プロセスが終了すれば失われる**（[architecture.md 第7章](architecture.md)）。現在は `PreviewScreen` 側の緩和策（オフライン中は保存ボタン無効化、送信後オフライン転落時は15秒タイムアウト）で対処しているが、これは「書込を開始させない／早めに諦める」対症療法であり、`constraints.md` が求める本来の「オフラインで下書きし復帰時に自動同期」は満たしていない。

`@react-native-firebase`（ネイティブ Firebase SDK、iOS/Androidのネイティブ実装をラップしたモジュール群）は、ネイティブ層で永続化されたオフラインキューを持ち、この制約を解消できる。

## 2. なぜ「Firestoreだけ」の移行では済まないか

`@react-native-firebase/firestore` は、同じく `@react-native-firebase/app`（＋ `@react-native-firebase/auth`）が確立したネイティブ側の Firebase Auth セッションに紐づいてリクエストを送信する。[firestore.rules](../firestore.rules) は全コレクションで `request.auth.uid` によるスコープを強制しているため、**ネイティブ Firestore SDK がネイティブ Auth セッションを持たない状態では、すべてのリクエストが権限拒否になる**。

一方、現在の認証（`src/services/auth/firebaseAuthProvider.ts`）は Firebase JS SDK（`firebase/auth`、AsyncStorage 永続化）で匿名認証・Apple/Google リンク昇格を行っている。JS SDK のセッションとネイティブ SDK のセッションは別物（前者はAsyncStorageの永続化トークン、後者はネイティブSDK自身のセッションストレージ）であり、**どちらか一方だけを移行しても両者は独立して動いてしまう**。

→ 結論: **Firestoreを移行するなら、Authも同じネイティブSDK（`@react-native-firebase/auth`）へ移行する必要がある。**

## 3. 全体方針

- 既存の「ネイティブ資格情報取得」（`nativeCredentialSource.ts` / `nativeCredentialSourceInstall.ts`）と同じ設計パターンを踏襲する: **フラグ（例: `EXPO_PUBLIC_USE_NATIVE_FIREBASE=1`）で開発ビルドのみ有効化し、Expo Go・Web は現行の Firebase JS SDK 経路をそのまま使う**。ネイティブモジュールは静的 import せず、フラグが立っているときだけ動的 require する（Expo Go のバンドルにネイティブモジュールを引き込まない）。
- `EntriesRepository` / `MessagesRepository`（`src/services/repository/`）はすでにインターフェース抽象化済みのため、**新しい Firestore アクセス実装（`@react-native-firebase/firestore` 版）を追加し、`getEntriesRepository()`/`getMessagesRepository()` の分岐にネイティブ経路を足すだけで済む**設計にする（既存の `firestoreEntriesRepository.ts`/`firestoreMessagesRepository.ts` は Web・非対応環境向けにそのまま残す）。
- Auth プロバイダも同様に `AuthProvider` インターフェース（`src/services/auth/types.ts`）に沿った新実装（`nativeFirebaseAuthProvider.ts` 等）を追加し、`getAuthProvider()` の分岐にネイティブ経路を足す。
- Web版連携ゲート（`WebConnectGate.tsx`）・QRペアリング（`pairing.ts`）・`webOAuth.ts` は Web 専用機能であり、**この移行の対象外**（Web は今後も Firebase JS SDK のまま）。

## 4. 最大のリスク: 既存匿名ユーザーの uid 継続

これが本移行で**最も注意が必要な設計課題**。

現在すでに使われている端末では、JS SDK の匿名認証で確立した uid（＋Apple/Googleにリンク昇格済みの場合はそのアカウント）が AsyncStorage に永続化されている。ネイティブ `@react-native-firebase/auth` は**別のセッションストレージ**を持つため、何も対策しないままフラグを立てると、次回起動時にネイティブ SDK 側が「初回起動」と誤認し、**まったく新しい匿名ユーザー（新しい uid）を作成してしまう**。結果、既存の日記データ（`users/{旧uid}/entries/...`）が見えなくなる（データ消失に見える重大な不具合）。

### 解決策: サーバ側でのカスタムトークン橋渡し

Worker には既に「認証済みの uid に対してカスタムトークンを発行する」実装がある（`worker/src/serviceAccount.ts` の `mintCustomToken`。QRペアリングの `verifyPairingToken` で使用中、[worker/src/pairing.ts:70](../worker/src/pairing.ts)）。これを再利用し、**移行専用のブリッジ処理**を新設する:

1. アプリ起動時、ネイティブ移行フラグが有効かつ「まだネイティブSDKへ移行していない」場合、**まず現行の JS SDK セッションを復元**（`firebaseAuthProvider.init()`）。
2. 復元できた場合、その JS SDK の ID トークンを Worker の新エンドポイント（例: `POST /migrateToNativeAuth`、既存の認証必須エンドポイントと同じく `Authorization: Bearer <IDトークン>` で `verifyFirebaseIdToken` により検証）へ送り、**同一 uid に対するカスタムトークン**を受け取る。
3. ネイティブ `@react-native-firebase/auth` の `auth().signInWithCustomToken(customToken)` でサインインする。これにより **uid・Apple/Googleのリンク状態・Firestoreデータがすべてそのまま引き継がれる**。
4. 移行完了をローカルフラグ（AsyncStorage等）に記録し、以降の起動ではこのブリッジ処理をスキップしてネイティブSDKの通常復元（`auth().onAuthStateChanged`）のみ行う。
5. JS SDK 側で一度も認証されたことがない全く新規の端末（初回インストール）の場合は、ブリッジを介さずネイティブSDKで直接匿名サインインしてよい（引き継ぐuidが存在しないため）。

この設計により、**Firebase Admin SDK（サーバ側）の関与が必須**であり、クライアント単体では安全に uid を引き継げない点に注意（カスタムトークンの署名にはサービスアカウント秘密鍵が必要で、これはクライアントに絶対に置けない。既存の `worker/src/serviceAccount.ts` の枠組みをそのまま使う）。

## 5. 必要な追加リソース（ユーザー側で準備）

`@react-native-firebase` は、現行の環境変数ベース（`EXPO_PUBLIC_FIREBASE_*`）とは別に、**ネイティブ設定ファイル**を要求する:

- iOS: `GoogleService-Info.plist`
- Android: `google-services.json`

いずれも Firebase Console（プロジェクト設定 → アプリを追加 → iOS/Androidアプリ）からダウンロードする公開可能な設定ファイル（シークレットではないが、環境ごと＝dev/staging/prodで別ファイルになる）。**ユーザー側で取得・配置する方針で確定済み**（本セッションでの確認事項）。配置後の運用:

- リポジトリには**コミットしない**か、環境ごとに配置を切り替える運用にする（`environments.md` の dev/staging/prod 分離方針に合わせる）。具体的な切り替え方式（EAS Secrets でファイルごとアップロードする／prebuild時にAPP_ENVに応じてコピーする等）は実装フェーズで決定する。
- `app.config.ts` の config plugin（`@react-native-firebase/app` が提供）が `google-services.json`/`GoogleService-Info.plist` のパスを認識して `ios/`/`android/` に配置する。

## 6. 影響ファイル一覧（想定）

| ファイル | 変更内容 |
|---|---|
| `package.json` | `@react-native-firebase/app`・`@react-native-firebase/auth`・`@react-native-firebase/firestore` を追加 |
| `app.config.ts` | `@react-native-firebase/app` の config plugin 追加。`googleServicesFile`（iOS/Android）をフラグ有効時のみ設定 |
| `src/services/auth/types.ts` | `AuthProvider` に `getIdToken(): Promise<string>` を追加（下記 `claudeWorker/client.ts` 対応のため）。`AuthUser` はそのまま。既存実装（`firebaseAuthProvider`/`localAuthProvider`）にも `getIdToken` の実装を追加する |
| `src/services/auth/nativeFirebaseAuthProvider.ts`（新規） | `@react-native-firebase/auth` を使った `AuthProvider` 実装。匿名認証・`linkWithCredential`相当・`getIdToken`・**移行ブリッジ（4章）を`init()`内部で`await`し完了させてから復元結果を返す**（下記「起動シーケンス」参照。fire-and-forgetにしない） |
| `src/services/auth/index.ts` | `getAuthProvider()` にネイティブ経路の分岐を追加 |
| `src/services/claudeWorker/client.ts` | **重要（reviewer指摘で判明した抜け）**: `getIdToken()`（16-27行）が `getFirebaseAuth().currentUser`（JS SDK固定）から直接IDトークンを取っており、`AuthProvider`抽象を経由していない。このままではネイティブ移行後、JS SDKセッションを一度も確立していない新規端末（ネイティブSDKへ直接匿名サインインするケース）で`currentUser`が常に`null`になり、`callClaudeWorker`（連想語提案・日記生成・対話・まとめ・QRペアリング発行・アカウント削除の全てが依存）が軒並み`unauthenticated`で失敗する。`getAuthProvider().getIdToken()`（上記で追加）経由に変更し、プロバイダ非依存にする |
| `src/services/pairing.ts` | **`createPairingToken()`（モバイル側QR発行）もclaudeWorker/client.ts経由のため上記と同じ影響を受ける**（「Web専用のため対象外」なのは`signInWithPairingToken`/`extractPairingToken`＝Web連携ゲート側のみ） |
| `src/stores/authStore.ts` | **重要（reviewer指摘）**: `initialize()`（`provider.init()`→Web版ガード→`provider.signIn()`）が移行ブリッジの成否を直接左右する。ブリッジが`nativeFirebaseAuthProvider.init()`内で完了してから返る設計（上記）であることを前提にした処理順のままで良いか、実装時に再確認する |
| `src/services/repository/nativeFirestoreEntriesRepository.ts`（新規） | `@react-native-firebase/firestore` 版の `EntriesRepository` 実装。オフライン永続は `firestore().settings({ persistence: true })`（既定で有効）が自動処理 |
| `src/services/repository/nativeFirestoreMessagesRepository.ts`（新規） | 同上、`MessagesRepository` |
| `src/services/repository/index.ts` | `getEntriesRepository()`/`getMessagesRepository()` にネイティブ経路の分岐を追加 |
| `worker/src/index.ts` / `worker/src/pairing.ts`（or 新規 `worker/src/migration.ts`） | `POST /migrateToNativeAuth` エンドポイント追加（4章のブリッジ用。`verifyFirebaseIdToken`→`mintCustomToken`を呼ぶだけの薄い実装） |
| `docs/api-contract.md` | 新エンドポイント `/migrateToNativeAuth` を追記 |
| `docs/architecture.md` 第7章 | 「当面の緩和策」の記述を「ネイティブ移行完了」に更新（移行完了後） |
| `docs/data.md` | uidスコープの前提（JS SDK/ネイティブSDK問わず同一uid空間である旨）を明記 |
| `.env.example` / `environments.md` | `EXPO_PUBLIC_USE_NATIVE_FIREBASE` フラグ、`GoogleService-Info.plist`/`google-services.json` の配置手順を追記 |

**変更不要**（Web専用・対象外）: `src/screens/webConnect/`、`src/services/auth/webOAuth.ts`、`src/services/pairing.ts`の`signInWithPairingToken`/`extractPairingToken`（Web連携ゲート用の部分。`createPairingToken`は上記の通り対象内）、`web/` 配下全体。

### 起動シーケンスに関する注意（reviewer指摘）

既存の「ネイティブ資格情報取得」の配線（`nativeAuthBootstrap.ts`）は **fire-and-forget**（`void installNativeCredentialSource().catch(...)`）で、資格情報ソースの同期的な差込みだけを行うため安全に非同期のまま起動できる。

しかし移行ブリッジ（4章）は「JS SDKセッション復元→IDトークン取得→Worker呼び出し→`signInWithCustomToken`」という**完了を待つ必要がある**非同期処理であり、同じfire-and-forgetパターンを流用すると、`authStore.initialize()`が並行して`provider.init()`を呼んだ際にブリッジ未完了のネイティブSDKが「復元セッションなし」と誤判定し、新しい匿名uidを発行してしまう（4章が防ごうとしている uid 消失バグを、配線ミスによって再現してしまう）。

→ **対策**: 移行ブリッジは独立した bootstrap ファイルに分離せず、`nativeFirebaseAuthProvider.init()` 内で `await` して完結させ、`authStore.initialize()` からは通常の `provider.init()` 呼び出しとして扱えるようにする（上記の影響ファイル一覧に反映済み）。

## 7. 段階的な移行手順（フェーズ案）

1. **フェーズ0（本ドキュメント）**: 設計確定。
2. **フェーズ1**: 依存追加・`app.config.ts` の config plugin 配線・ユーザーによるネイティブ設定ファイル配置・開発ビルドが正常に起動することの確認（フラグ無効時＝現行動作に影響が無いことを確認）。
3. **フェーズ2**: Worker側 `/migrateToNativeAuth` エンドポイント実装＋テスト（`worker/` は既存の認証必須エンドポイントと同型のため低リスク）。
4. **フェーズ3**: `nativeFirebaseAuthProvider.ts`（匿名認証＋カスタムトークンサインインのみ、リンク昇格は後回し可）を実装し、フラグ有効時に**新規インストール端末**で正しく匿名サインインできることを確認。
5. **フェーズ4**: 移行ブリッジ（4章）を実装し、**既存の匿名ユーザーが uid を維持したままネイティブSDKへ切り替わる**ことを実機で確認（最重要の検証ポイント）。
6. **フェーズ5**: Apple/Googleリンク昇格をネイティブAuthプロバイダ側にも実装（`nativeCredentialSource.ts` は既にネイティブ非依存のロジックのため、`linkWithCredential`相当の呼び出し先を差し替えるだけで再利用できる見込み）。
7. **フェーズ6**: Firestoreリポジトリのネイティブ実装・オフライン書込→復帰後自動同期の実機確認（機内モードでの実地テストが必須）。
8. **フェーズ7**: 段階ロールアウト（社内配布→一部ユーザー→全体）、旧経路（JS SDK）の廃止判断。

## 8. 検証方法・このセッションでは確認できないこと

- 本プロジェクトの開発環境（このツール実行環境）には **iOS/Androidの実機・シミュレータが無い**。ネイティブモジュールの動作確認・オフライン永続化の実地検証（機内モードでの書込→復帰後の自動同期）は、**ユーザー側で開発ビルドを作成し実機/シミュレータで確認する必要がある**（既存の「ネイティブ資格情報取得」実装時と同様の運用）。
- `jest` によるユニットテストは、既存パターン（`nativeCredentialSource.ts`のようにネイティブ非依存ロジックを分離）に沿えばモックで検証可能だが、**実際のネイティブSDKの永続化挙動そのものはユニットテストでは検証できない**。

## 9. 未解決・要検討事項

- **（reviewer指摘・要対応）** `src/services/claudeWorker/client.ts`の`getIdToken()`がJS SDK固定でプロバイダ抽象を経由していない問題。第6章の対応方針（`AuthProvider.getIdToken()`追加）で解消できる想定だが、実装時に他の直接`getFirebaseAuth()`参照箇所が無いか横断的に確認する。
- **（reviewer指摘・要対応）** 移行ブリッジの起動タイミング（fire-and-forgetにするとuid消失バグを再現しうる）。第6章「起動シーケンスに関する注意」の対策方針（`nativeFirebaseAuthProvider.init()`内で`await`完結）で実装する。
- ネイティブ設定ファイル（`GoogleService-Info.plist`/`google-services.json`）の**環境別（dev/staging/prod）切り替え方式**（EAS Secretsでのファイルアップロード vs prebuildスクリプトでの切り替え）は未決定。
- Apple/Googleの**リンク昇格**をネイティブAuthプロバイダでどう実装するか（`@react-native-firebase/auth`のAPI形状を実装時に確認する必要あり）。
- New Architecture（Expo SDK 57 / RN 0.86 は既定で有効）との`@react-native-firebase`バージョン互換性は、実装フェーズ開始時点の最新バージョンで要確認。
- 移行ブリッジ（4章）の**失敗時フォールバック**（Worker到達不可時にどうするか。案: ブリッジ失敗時はネイティブSDKへ切り替えず現行JS SDK経路を維持し、次回起動時に再試行）。
- ロールバック戦略（ネイティブ移行後に何らかの重大不具合が発覚した場合、フラグを戻すだけでJS SDK経路に戻せるか。ローカルの「移行済みフラグ」の扱いを含めて要検討）。

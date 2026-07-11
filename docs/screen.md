# たそがれ日記 詳細設計：画面仕様（screen.md）

> **位置づけ**: ステップ3（詳細設計）。[architecture.md](architecture.md) のナビゲーション・状態管理・デザインシステム、[data.md](data.md) のスキーマを前提に、各画面のレイアウト・要素・状態（ローディング/空/エラー）・遷移・操作・アクセシビリティを定義する。API は [api-contract.md](api-contract.md)（後続作成）。
> **UI の正**: `visual-design.html` v1（画面ID・クラス名・文言を引用）。要件の正: Notion [たそがれ日記 要件定義書](https://app.notion.com/p/395cd5c5312e81b0b73fc2d95219b084)。
> **表記**: 「クラス」は `visual-design.html` の CSS クラス。RN 実装名は [architecture.md](architecture.md) 第5.3節のコンポーネント対応に従う。

---

## 0. 共通規約

### 0.1 画面一覧（`visual-design.html` `.nav` ①〜⑪）
| # | 画面 | ID | 種別 | 節 |
|---|---|---|---|---|
| ① | ホーム | `home` | モバイル | 3.1 |
| ② | きもち | `mood1` | モバイル | 3.2 |
| ③ | できごと | `event1` | モバイル | 3.3 |
| ④ | ことば | `combine1` | モバイル | 3.4 |
| ⑤ | たしかめる | `create2` | モバイル | 3.5 |
| － | 灯（演出） | － | オーバーレイ | 3.6 |
| ⑥ | カレンダー/一覧 | `calendar` | モバイル | 3.7 |
| ⑦ | 詳細＋AI対話 | `detail` | モバイル | 3.8 |
| ⑧ | 設定 | `settings` | モバイル | 3.9 |
| ⑨ | Webで見る（QR） | `webConnect` | モバイル | 3.10 |
| ⑩ | ダッシュボード | `dashboardView` | Web | 4.1 |
| ⑪ | デバイスをつなぐ | `connectView` | Web | 4.2 |
| ⑫ | 日記一覧（Web） | `entriesView` | Web | 4.3 |

### 0.2 共通コンポーネント
- **ステータスバー**（`.status-bar`）: 端末標準に置換（モックの `9:41` は不要）。
- **サブ画面ヘッダー**（`.screen-header`）: 戻る（`.back-btn`）＋タイトル（`.header-title`）or ステップ進捗（`.step-progress`）。
- **下部タブ**（`.tab-bar`）: ホーム／カレンダーのみ（詳細・作成フロー・設定では非表示）。
- **主ボタン**（`.primary-btn`）／ゴースト（`.ghost-btn`）／候補チップ（`.pebble`）。

### 0.3 状態表現の共通ルール
| 状態 | 方針 |
|---|---|
| ローディング | Claude 応答・保存中はプレースホルダ/スピナーで**フリーズさせない**（[constraints.md](../.claude/rules/constraints.md)）。ボタンは二度押し防止で無効化。 |
| 空 | 一覧系は空文言（例「まだ日記がありません」）＋日記導線。 |
| エラー | ネットワーク/API 失敗は非破壊的トースト＋再試行。**入力・下書きは保持**。 |
| オフライン | Claude 必須処理（連想/生成/対話/まとめ）はオフライン時に不可の旨を明示し、下書きは保存（[architecture.md](architecture.md) 第7章）。 |

### 0.4 アクセシビリティ共通
- フォーカス可視化（`:focus-visible` 相当）、操作要素に `accessibilityRole`/ラベル、Enter/Space 相当の活性化。
- `prefers-reduced-motion` 相当でオーブ等のアニメを停止/簡略化（[architecture.md](architecture.md) 第8章）。
- たそがれ配色でも十分なコントラスト、文字サイズ変更に追従。

---

## 1. 画面遷移マップ
```mermaid
graph LR
  Home -->|hero| Mood --> Event --> Words --> Preview
  Preview -->|保存| Saved -->|点灯演出| Lit --> Home
  Home -->|tab| Calendar
  Home -->|⚙| Settings
  Calendar -->|エントリ| Detail
  Home -->|最近の日記| Detail
  Settings -->|Webで見る| WebConnect
  Preview -->|↻ 選び直す| Words
```
> 詳細な戻る遷移・状態は [architecture.md](architecture.md) 第3.3節を参照。

---

## 2. 日記作成フロー共通
- **進捗**（`.step-progress` / `.step-dot`）: 4ドット。current/done/未到達で表現（`.step-dot.current` / `.done`）。灯は進捗に含めない。
- **recap**（`.recap-row` / `.recap-tag`）: 前ステップの選択を要約表示（例「気持ち：疲れた」）。
- **スキップ**（`.skip-link`「今は思い浮かばない」）: きもち/できごとで可。スキップ時は当該項目を空として次へ。
- **下書き**: 各ステップの入力は `draftStore` に即時保持（オフライン継続）。
- **入力**（`.input-row` + `.add-btn`）と**候補チップ**（`.pebble`、`.divider-or`「または」で区切り）。

---

## 3. モバイル画面

### 3.1 ホーム（`home`）
- **目的**: その日の入口。オーブで感情の余韻を示し、日記作成へ誘導。
- **要素**: アプリ名（`.app-title`）／日付（`.date-label`）／設定（`.settings-icon` ⚙）／ヒーロー（`.hero-zone` + 大 `.orb` + `.hero-btn`「日記を書く」）／この一週間（`.week-strip`：7日分 `.orb-mini`）／最近の日記（`.entry-card` × N）／下部タブ。
- **データ**: `entries`（直近数件、`date` 降順）、週間は直近7日の各日 `mood`。
- **状態**: 空＝オーブ＋導線のみ（週/一覧は空文言）。ローディング＝一覧スケルトン。
- **遷移**: ヒーロー/⚙/タブ/エントリタップ → Mood / Settings / Calendar / Detail。
- **A11y**: `.hero-zone` は role=button・Enter/Space 活性化（モック実装済み）。オーブは reduced-motion で静止。

### 3.2 きもち（`mood1`／step1）
- **目的**: いまの気持ちを一言または候補から選ぶ。
- **要素**: ヘッダー（戻る＋進捗「きもち」current）／プロンプト（`.prompt-text`「今、どんな気持ちですか？」＋`.prompt-sub`「一言で大丈夫です」）／入力（`.input-row` placeholder「疲れた、とか…」＋`.add-btn`）／「または」／候補（`.chip-suggest-label`「言葉が浮かばないときは」＋`.chip-row` の `.pebble`）／次へ（`.primary-btn`）／スキップ（`.skip-link`）。
- **データ書込**: `draftStore.mood`（自由語/選択語）。感情 enum は後段（たしかめる）で Claude 推定（[data.md](data.md) 第4章）。
- **状態**: 未入力でも「次へ」可（スキップ相当）。候補チップは固定＋傾向差し替え（生成主体 U-06）。
- **遷移**: 次へ→Event／戻る→Home。

### 3.3 できごと（`event1`／step2）
- **目的**: きょうのできごとを一言または候補から選ぶ。
- **要素**: 進捗「できごと」current（step1 done）／recap（`.recap-tag`「気持ち：**疲れた**」）／プロンプト「今日は何をしていましたか？」／入力＋候補（`.pebble`「カフェ/仕事/友達と…」）／次へ／スキップ。
- **データ書込**: `draftStore.words`（category=`event`）。
- **遷移**: 次へ→Words／戻る→Mood。

### 3.4 ことば（`combine1`／step3）
- **目的**: きもち・できごと＋傾向から Claude が連想語を提案し、取捨選択する。
- **要素**: 進捗「ことば」current／recap（気持ち・できごと）／プロンプト（`.prompt-text`「そこから、こんな言葉も浮かびました」）／連想の説明（`.associate-note`）／候補（`.pebble`、選択は `.pebble.on`＋`×` で解除）／自由追加（`.divider-or`「他にしっくりくる言葉があれば」＋`.input-row`）／選んだ言葉（`.selected-label`「選んだ言葉（N）」＋`.selected-chips`）／「文章にする」（`.primary-btn`）。
- **入出力（概念）**: 入力＝選択済み語＋過去頻出語 → 出力＝連想候補（[data.md](data.md)／api-contract.md）。
- **状態**: **連想取得中**＝候補エリアにローディング。取得失敗＝再試行＋手動入力で継続可。オフライン＝連想不可の明示、手動入力は可。
- **遷移**: 文章にする→Preview／戻る→Event。

### 3.5 たしかめる（`create2`／step4）
- **目的**: 選択語から生成した日記文を確認・調整して保存。
- **要素**: 進捗「たしかめる」current／生成文（`.note-card` + `.note-tape`）／調整（`.adjust-label`「調整する」＋`.adjust-row` の `.ghost-btn`「もっと前向きに/短くして/詳しく/↻選び直す」）／感情プレビュー（`.mood-preview-row`：`.orb-mini`＋`.mood-preview-text`「やや疲れの一日」＋`.mood-preview-note`「保存後もいつでも調整できます」）／保存（`.primary-btn`「保存する」）。
- **入出力（概念）**: 入力＝確定語＋感情 → 出力＝本文＋推定感情ラベル（[data.md](data.md) 第3.2/4章）。
- **状態**: **生成中/再生成中**＝`.note-card` にローディング、調整ボタン無効化。**保存中**＝ボタン無効化（二度押し防止）。保存失敗＝下書き保持＋再試行。
- **書込**: 成功時 `entries`（bodyText/mood/words/…）作成 → 灯の演出へ。「↻選び直す」→Words。
- **遷移**: 保存→（灯）→Home or Detail／戻る→Words。

### 3.6 灯の演出（保存後）
- **目的**: 保存完了を「こころの灯」が灯る演出で締める（要件定義書 §4.1）。**専用入力画面は持たない**オーバーレイ/トランジション。
- **表現**: ホーム大オーブへ遷移しつつ、グロー→当日の感情色へ収束→気づき一言を短くフェード表示（詳細数値は [architecture.md](architecture.md) 第8.2節）。所要 ~1.2–1.6s。
- **reduced-motion**: グロー省略、感情色反映＋一言のクロスフェードのみ。
- **遷移**: 完了で Home（オーブ更新）。保存直後に詳細を開く導線も可。
- **データ**: `entries.awareness`（気づき一言、任意）。

### 3.7 カレンダー/一覧（`calendar`）
- **目的**: 過去の記録の俯瞰と検索。
- **要素**: ヘッダー（`.app-title`「過去の日記」）／表示切替（`.view-toggle`「カレンダー/リスト」）。
  - **カレンダー**（`#calendarView`）: 月ラベル／曜日行（`.weekday-row` 月〜日）／グリッド（`.cal-grid` の `.cal-cell`、日ごと `.orb-mini` で感情）／凡例（`.legend` 穏やか/やや疲れ/しんどい）／週次インサイト（`.insight-card`「今週の傾向」）。
  - **リスト**（`#listView`）: 検索（`.search-row`）／月見出し（`.month-divider`）／エントリ（`.list-entry`：日付＋本文2行省略＋タグ＋`.orb-mini`）。
- **データ**: `entries`（`date` 範囲/降順）、`insights`（`weekly`、[data.md](data.md) 第3.5節）。感情色は共通トークン。
- **状態**: 空＝「まだ日記がありません」。検索0件＝該当なし表示。インサイト生成前＝非表示 or プレースホルダ。
- **遷移**: エントリ→Detail／タブ→Home。

### 3.8 詳細＋AI対話（`detail`）
- **目的**: 1件の日記を読み、AI と振り返る。
- **要素**: ヘッダー（戻る＋日付タイトル）／本文（`.diary-full-text`, display フォント）／タグ（`.tags-used`）／感情バッジ（`.mood-badge` + `.orb-mini`）／「AIと話す」（`.section-label`）／会話（`.chat-bubble.ai`/`.me`）／入力（`.chat-input-row` + `.send-btn`）。
- **データ**: `entries/{id}`、`messages`（`createdAt` 昇順、保存要否 U-05／既定=保存、[data.md](data.md) 第3.3節）。
- **状態**: **AI応答待ち**＝送信後にタイピング/プレースホルダ。送信失敗＝再試行、入力保持。オフライン＝対話不可の明示。空対話＝AI からの最初の問いかけを表示。
- **操作**: 本文の再調整（保存後調整、`.mood-preview-note` の方針）を将来導線化（未確定）。
- **遷移**: 戻る→前画面（Calendar/Home）。

### 3.9 設定（`settings`）
- **目的**: Web連携・バックアップ・アカウント削除等の入口。
- **要素**: ヘッダー（戻る＋「設定」）／行（`.settings-row`）: 「Webで見る」（`.settings-row-sub`「パソコンから日記を見られるようにする」）／「バックアップする」（「機種変更・削除に備えてアカウントを保存」）／「アカウントを削除する」（「日記・対話・連携情報がすべて削除されます」）。
- **遷移**: 「Webで見る」→WebConnect。バックアップ→**Apple/Google アカウント連携で担保（U-13決定）**。
- **実装メモ（実装済み）**: `src/screens/settings/SettingsScreen.tsx`。連携UI（Apple/Google リンク昇格。`AccountLinkSection`）は WebConnect 画面側に既に実装済みのため重複実装を避け、**「バックアップする」行も WebConnect へ遷移する**（U-13決定の「画面上のアクションは再認証確認程度」を、独立した確認UIではなく既存の連携導線への遷移で満たす設計判断）。**「バックアップする」行は連携が実際に可能な場合のみ表示する**（`useLinkableAccountKinds`＝`src/hooks/useAccountLink.ts`。匿名アカウントかつネイティブ資格情報ソース導入済みの開発ビルドが条件、`environments.md`）。既に恒久化済み、または既定の Expo Go 等で導入前の環境では行自体を出さない（遷移先で `AccountLinkSection` が何も描画しない「押しても何も起きない」導線を避けるため。WebConnect 側の「未対応の空UIを出さない」原則と統一）。**「アカウントを削除する」行はタップで画面内に確認UI（`.settings-row` の代わりに警告文＋「本当に削除する」／「キャンセル」）を表示する2段階確認**（`DeleteAccountSection`）。確認後の削除は `deleteAccount()`（`src/services/account.ts`）→成功時は `authStore.signOut()`（削除済みセッションをクリアし新しい匿名セッションを確立）→ `MainTabs`/`Home` へ遷移。失敗時は確認UIのままエラー文を表示し再試行できる。**Worker 未設定時（モック運用）は行自体を表示しない**（`isAccountDeletionAvailable`。削除は不可逆なため「削除できたふり」をしない方針）。
- **将来**: reduced-motion 等の設定項目を追加。

### 3.10 Webで見る（QR）（`webConnect`）
- **目的**: PC でダッシュボードを見るためのデバイス連携（QR 表示）。
- **要素**: ヘッダー（戻る＋「Webで見る」）／説明（`.prompt-text`「パソコンでも、書いた日記をそのまま見られます」＋`.prompt-sub`「下のコードを、パソコンのブラウザで読み取ってください」）／QR（`.qr-card` + `.qr-pattern` + `.qr-finder`）／タイマー（`.qr-timer-track`/`.qr-timer-fill` + `.qr-timer-label`「60秒ごとに更新」）／「または」＋Apple/Google サインイン（`.ghost-btn`）／注記「スマホの日記データはそのまま、安全に保たれます」。
- **データ**: Functions が `pairings` に短命トークン発行（TTL 60s、[data.md](data.md) 第3.6節）。60秒ごとに再発行し QR 更新。
- **状態**: 要ログイン（未ログイン時はサインイン導線）。発行失敗＝再試行。タイマー満了＝自動更新。
- **A11y**: QR は装飾。代替として Apple/Google サインインを常時提供。

---

## 4. Web 画面（振り返り専用）

### 4.1 ダッシュボード（Web）（`dashboardView`）
- **目的**: 月次中心の俯瞰。分析はここに集約（モバイルに出さない、[basic-design.md](design/basic-design.md) 第2.2節）。
- **要素**: ブラウザ枠（`.browser-url` `tasogare-diary.app/dashboard`）／サイドバー（`.dash-sidebar`：ホーム/カレンダー/ダッシュボード）／ヘッダー（`.dash-title`「振り返りダッシュボード」＋期間タブ `.period-tabs` 今週/今月/過去3ヶ月）／AIまとめ（`.dash-narrative`「AIによる今月のまとめ」＋`.dash-narrative-text`）／感情推移（`.dash-card`「感情の推移（週ごと）」＋`.mood-chart` 積み上げ＋`.legend`）／よく使う言葉（`.word-rank` 上位N＋件数）／注記（`.dash-note`：モバイル非表示の設計原則）。
- **データ**: `insights`（`monthly` 主、`moodDistribution`/`topWords`/`narrative`）、`wordStats`（[data.md](data.md) 第3.4/3.5節）。生成は Functions（案B）。
- **状態**: 生成前＝プレースホルダ。データ不足（記録少）＝その旨を表示。読取専用（編集可否 U-09）。
- **A11y**: グラフに数値/凡例を併記、色のみに依存しない。
- **実装メモ（Phase4・実装済み）**: `web/src/app/dashboard`。まとめは Worker の `generateInsight`（本文を LLM へ送らない）から取得。期間タブは**今週/今月/過去3ヶ月**を実装（`.mood-chart`＝`MoodChart`／`.word-rank`＝`WordRank`／`.dash-narrative`＝AIまとめ）。**感情推移カードは現状「期間全体の百分率」を1本の積み上げバーで表示**（`generateInsight` が返す `moodDistribution` は期間集計値のため、カード見出しは「感情の推移」とし「（週ごと）」の週別積み上げは後続）。**「過去3ヶ月」タブは実装済み**（`generateInsight` に `type: 'quarterly'` を追加。periodKey は monthly と同じ `YYYY-MM` で末尾の月＝今月を表し、その月を含む直近3ヶ月を集計する＝暦上の四半期ではない。`worker/src/insight.ts` の `quarterlyRange`）。エントリ皆無（`failed-precondition`）は「記録がまだありません」を表示。

### 4.2 デバイスをつなぐ（Web）（`connectView`）
- **目的**: モバイルの QR を PC カメラで読み取り、Web をサインインさせる。
- **要素**: ブラウザ枠（`.browser-url` `.../connect`）／ビューファインダ（`.viewfinder` + `.vf-corner`、`softPulse`）／タイトル「スマホのQRコードを映してください」／説明（`.connect-sub`）／状態（`.connect-status` + `.pulse-dot`「読み取り待機中…」）／「うまく読み取れない場合」＋Apple/Google サインイン（`.ghost-btn`）。
- **フロー**: QR トークンを Functions が照合→カスタム認証トークン発行→サインイン（[architecture.md](architecture.md) 第3.4節相当のシーケンス、詳細は api-contract.md）。
- **状態**: 待機/読取成功/失効・不正トークン（再取得を促す）/成功（ダッシュボードへ）。
- **A11y**: カメラ不可環境向けに Apple/Google サインインを代替提供。`softPulse` は reduced-motion で停止。
- **実装メモ（Phase4・実装済み）**: `web/src/app/connect`（カメラでの QR ライブ読取＋コード貼り付けで連携。`web/src/components/QrScanner.tsx`、`getUserMedia`＋`jsQR` によるデコード）＋`web/src/app/pair`（モバイル QR ディープリンク `<WEB_URL>/pair?token=…` の着地点）。照合は `verifyPairingToken`→`signInWithCustomToken`（api-contract.md 5.2）。**Apple/Google サインイン代替も実装済み**（`web/src/lib/oauth.ts` の `signInWithProvider`＝`signInWithPopup(GoogleAuthProvider / OAuthProvider('apple.com'))`。`/connect` に「または」区切り＋Google/Apple ボタンを常設。なお本画面は visual-design.html の `.ghost-btn` 等のクラス名ではなく、connect 全体と同じくインライン style オブジェクト（`styles.outlineButton`）で実装している）。**前提**: 同じ資格情報がモバイルの匿名アカウントへ `linkWithCredential` で昇格済みのときのみ同一 uid となり既存日記が見える。**モバイル側の昇格ロジックは実装済み**（`firebaseAuthProvider.linkWith`／`authStore.linkAccount`／本画面 `WebConnectScreen` の `AccountLinkSection`＝「または」＋Apple/Google 連携ボタン。`.ghost-btn` 相当は `PrimaryButton variant="ghost"`）。**ネイティブのサインインUI（資格情報取得）も実装済み**（`nativeCredentialSource.ts`＝Apple・Google 資格情報取得の中核＋`nativeCredentialSourceInstall.ts` の `installNativeCredentialSource()`。`OAuthCredentialSource` シーム越しに `setCredentialSource` で差し込む）。ただし有効化には**開発ビルド**が必要（ネイティブモジュール要）で、その起動エントリで `installNativeCredentialSource()` を呼ぶ。既定（Expo Go）は同関数を読み込まないため `canLinkAccount` が false で導線を出さない。Firebase Console で各プロバイダの有効化（Apple は Apple Developer の「Sign in with Apple」構成、Google は webClientId＝`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`）が必要（[web/README.md](../web/README.md)・[environments.md](../.claude/rules/environments.md)）。

### 4.3 日記一覧（Web）（`entriesView`）
- **目的**: 書いた日記本文をパソコンでそのまま読み返す（3.10 の約束「パソコンでも、書いた日記をそのまま見られます」を Web で実現）。分析（4.1）と役割分担し、こちらは**本文閲覧**を担う。
- **要素**: ヘッダー（「日記の一覧」＋ダッシュボードへのリンク）／検索欄（読み込み済み範囲をキーワード絞り込み）／エントリカード（`.diary-entry`：日付＋感情チップ／本文 `.diary-full-text`／選択語タグ `.tags-used`／気づき）／無限スクロール用の読込目印／注記（Web 限定表示）。
- **データ**: `entries`（`users/{uid}/entries`、`date` 降順・カーソルページング、[data.md](data.md) 第3.2節）。**Firestore を直読**（サインイン済み本人のみ read 可能：`firestore.rules`）。まとめ（`insights`）と異なり Worker を介さない。
- **状態**: 読込中／記録なし（その旨表示）／取得失敗（再試行）／一覧表示／全件読込済み。**読取専用（U-09）**：編集導線を持たない。1日1件（U-11）前提で日ごとに縦積み。
- **A11y**: 感情は色＋ラベルを併記（色のみに依存しない）。
- **実装メモ（Phase4・実装済み）**: `web/src/app/entries`（`EntryList`＝`.diary-entry`）。取得は `web/src/lib/entries.ts` の `fetchEntriesPage`（`date` 降順＋`startAfter` カーソルで無限スクロール。`IntersectionObserver` で末尾の目印を検知し次ページを読込む）。検索は読み込み済みエントリの本文／選択語をクライアント側でキーワード絞り込み（Firestore 全文検索非対応・本文を外部検索サービスへ送らない方針のため）。ダッシュボード（4.1）と相互リンク。

---

## 5. 要件・設計トレース
| 本書の対象 | 対応元 |
|---|---|
| 画面①〜⑪・文言・クラス | `visual-design.html` `.nav`／各 `.screen` |
| 4ステップ→灯の遷移 | [architecture.md](architecture.md) 第3章／Notion §4.1 |
| 感情色・オーブ | `visual-design.html` `.legend`/`.orb`／[architecture.md](architecture.md) 第8章 |
| データ書込/読取 | [data.md](data.md) 各節 |
| 分析はWeb限定・週次はモバイル | [basic-design.md](design/basic-design.md) 第2.2節／[data.md](data.md) 第3.5節 |
| ローディング/オフライン/最小化 | [constraints.md](../.claude/rules/constraints.md) |

---

## 6. 未確定・申し送り
- **U-05（決定）**: 詳細画面の会話履歴は**保存する**（非保存オプションは当面なし）。
- **U-06（決定）**: 候補チップ・連想語は**都度 Claude＋過去傾向**（候補チップ初期は固定辞書＋傾向差し替え）。
- **U-09（決定）**: Web ダッシュボードは**閲覧専用**。
- **U-11（決定）**: **1日1件**（UI で制約）。
- **U-13（決定）**: バックアップは**Apple/Google アカウント連携**で担保。
- **保存後の本文再調整**（詳細画面）の導線・仕様（残・実装で確定）。
- **空/エラー文言**の確定コピー（本書は方針のみ、残）。
- **api-contract.md へ**: 連想/生成/調整/対話/まとめ、QR 発行・照合、感情推定の I/O。

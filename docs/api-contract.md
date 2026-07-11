# たそがれ日記 詳細設計：API仕様（api-contract.md）

> **位置づけ**: ステップ3（詳細設計）。[architecture.md](architecture.md) の構成、[data.md](data.md) のスキーマ、[screen.md](screen.md) の画面要件を前提に、**AI 連携のエンドポイント仕様**、**リクエスト/レスポンス**、**認証方式**を定義する。
> **要件の正**: Notion [たそがれ日記 要件定義書](https://app.notion.com/p/395cd5c5312e81b0b73fc2d95219b084)。
> **技術選定**: 要件に明記が無いものは「案A/案B＋推奨」で提示し断定しない。
> **実装メモ（Phase2）**: Firebase は **Spark プラン（無料枠）を維持**する方針のため、生成系（AI 連携）エンドポイントは Firebase Functions ではなく **Cloudflare Workers**（`worker/`）で実装している。Functions 前提で書かれた箇所（Callable・`context.auth` 等）は概念上の対応関係として読み替える（詳細は各節の実装メモ、[environments.md](../.claude/rules/environments.md)、[worker/README.md](../worker/README.md)）。
> **実装メモ（LLM プロバイダ）**: 本書は Claude（Anthropic）前提で記述しているが、**無料運用を優先**し実装は **Google Gemini API** に変更している（U-12 は Gemini 前提に読み替え。[environments.md](../.claude/rules/environments.md) 参照）。将来 Anthropic 等の有料 API へ戻す可能性はあるが、その際も本書のインターフェース仕様（第3章）は変わらない想定。

---

## 1. 全体方針

- **AI API はクライアント直叩き禁止**。すべて**サーバ側プロキシを経由**する（[constraints.md](../.claude/rules/constraints.md)／[environments.md](../.claude/rules/environments.md)）。API キーはプロキシの秘密（Secrets）にのみ保持。
  - 実装（Phase2）: **Cloudflare Workers**（`worker/`）。Firebase Blaze プラン回避のため Firebase Functions は不採用。
- **最小送信**: AI へは応答生成に必要な最小限のみ送る。日記本文・送信ペイロード・個人特定情報を**ログに残さない**（第8章）。
- **冪等性**: 生成系は非冪等（都度生成）。書込系（保存・削除・ペアリング消費）は二重実行に耐える設計とする。

### 1.1 呼び出し方式（案・推奨）
- 案A: **Callable Functions**（`httpsCallable`、Firebase Functions）。Firebase SDK が ID トークンを自動付与し、`context.auth` で uid を取得できる。CORS/認証の実装が簡潔。**Blaze プラン必須**。
- **採用（Phase2）**: **Cloudflare Workers + `fetch`**。クライアントが Firebase ID トークンを取得し `Authorization: Bearer` で送信、Worker 側でサードパーティ JWT ライブラリ（`jose`）により検証する（`worker/src/auth.ts`）。Firebase は Spark プランのまま（Firestore/Authentication のみ）。
- 本書の各エンドポイント記述は Callable 前提の記法（`data`/`result`、Firebase エラーコード）を用いるが、Phase2 実装では HTTP（POST + JSON body、レスポンスは同型、エラーは `{ error: { code, message } }` + 対応する HTTP ステータス）に読み替える。

### 1.2 認証
| 対象 | 認証 |
|---|---|
| 生成系・書込系・削除 | Firebase Auth の ID トークン必須（当面は**匿名認証**で uid を確立。将来 Apple/Google をリンク昇格）。未認証は `unauthenticated`。Phase2 実装では Worker が ID トークンを検証し uid を得る（`context.auth.uid` 相当） |
| QR ペアリング照合（Web 初回） | 未サインインでも可。短命トークンを検証しカスタムトークンを返す（第5章）。**サーバ側・Web 側 UI ともに実装済み**（`worker/src/pairing.ts` / `web/src/lib/pairing.ts`・`web/src/app/pair`・`web/src/app/connect`。§10） |

- リソースは常に呼び出し元 uid にスコープ（他者データへのアクセス不可）。

### 1.3 モデル選定（U-12・2026-07-09 改定）
| 用途 | モデル（既定） | 理由 |
|---|---|---|
| 連想語提案 / AI対話 / 調整 | **`gemini-3.1-flash-lite`** | 低遅延・低コスト（無料枠）。対話/インタラクションの体感を軽く保つ |
| 日記文生成 / 週次・月次まとめ | **`gemini-3.5-flash`** | 無料枠の中で品質・表現力を優先 |

- **変更履歴**: 当初 Claude Haiku 4.5（連想/対話/調整）・Claude Sonnet 5（生成/まとめ）で決定していたが、**課金を発生させず無料枠で運用したい**というユーザー方針により Google Gemini API（Gemini Developer API・無料枠）へ変更した（詳細は [environments.md](../.claude/rules/environments.md)）。将来アプリが軌道に乗る／AI 能力に不満が出た場合は Anthropic 等の有料 API へ戻す可能性がある。モデルは環境変数（`GEMINI_MODEL_INTERACTIVE`/`GEMINI_MODEL_GENERATE`）で差し替え可能。

### 1.4 共通エラー形式
Firebase の標準エラーコード相当のコード体系を用いる（Callable では `HttpsError`、Phase2 の Worker 実装では `{ error: { code, message } }` + HTTP ステータスとして表現）。

| code | 意味 | 例 |
|---|---|---|
| `unauthenticated` | 未認証 | ID トークン無し |
| `invalid-argument` | 入力不正 | 必須欠落・型不一致 |
| `resource-exhausted` | レート/クォータ超過 | AI API レート、関数同時実行 |
| `unavailable` | 一時障害 | AI API 一時エラー、ネットワーク |
| `deadline-exceeded` | タイムアウト | 生成が上限超過 |
| `permission-denied` | 権限外 | 他者リソース |
| `internal` | 内部エラー | 想定外 |

- クライアントは `unavailable`/`deadline-exceeded`/`resource-exhausted` を再試行対象とし、入力・下書きは保持（[screen.md](screen.md) 0.3）。

---

## 2. AI 連携の内部仕様（Worker → Gemini）

> 本節は Phase2 実装（Gemini）に合わせて記述する。当初 Anthropic Messages API を前提に設計していたが、無料運用のため Gemini Developer API に変更した（第1.3節）。

- **エンドポイント**: Gemini Developer API（`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`）。ヘッダ `x-goog-api-key`（Secrets）。
- **共通パラメータ**: `model`（第1.3節）、`generationConfig.maxOutputTokens`（用途別上限）、`systemInstruction`（役割・トーン・安全方針）、`contents`（対話履歴＋当該メッセージ）。構造化出力時は `generationConfig.responseMimeType: "application/json"` ＋ `responseSchema` を付与（`worker/src/llm/gemini.ts`）。
- **system プロンプト方針（要点）**: 「たそがれ時に心を整える、静かで温かい伴走者。共感的に、短く、断定や診断をしない。日本語」。プロンプトのバージョンを `promptVersion` として `entries.source`／`insights.source` に記録（本文送信内容自体はログ化しない）。
- **ロール対応**: 保存モデルの `ai`/`me`（[data.md](data.md)）を二段階で写像する。まず `worker/src/index.ts` の `toLlmHistory` でプロバイダ非依存ロール `assistant`/`user` に写像し、次に各プロバイダ（`worker/src/llm/gemini.ts` の `toGeminiRole`）が自社のロール（Gemini は `model`/`user`）へ再写像する。
- **タイムアウト**: Worker 側で `fetch` にタイムアウトを設定し、`deadline-exceeded` を制御（`worker/src/llm/gemini.ts`）。

> 送信は最小限（当該ステップの選択語・当日文脈・必要な過去要約のみ）。過去全件や個人特定情報は送らない（第8章）。

---

## 3. 生成系エンドポイント

> すべて Callable。認証必須（`context.auth.uid`）。リクエストは `data`、レスポンスは `result`。日時は ISO8601、`date` は `YYYY-MM-DD`。

### 3.1 `suggestWords` — 連想語提案（ことば／step3）
- **用途**: きもち・できごと＋傾向から連想語候補を返す（[screen.md](screen.md) 3.4）。
- **モデル**: interactive（既定 `gemini-3.1-flash-lite`、第1.3節）。
- Request:
```json
{
  "mood": "疲れた",
  "moodEnumHint": "tender",
  "events": ["カフェ"],
  "selected": ["友達"],
  "locale": "ja"
}
```
- Response:
```json
{
  "suggestions": [
    { "text": "締め切り", "category": "assoc" },
    { "text": "晴れ", "category": "assoc" },
    { "text": "話せてよかった", "category": "assoc" }
  ],
  "promptVersion": "words-v1"
}
```
- 備考: 傾向（過去頻出語）はサーバが `wordStats` から補完してよい（クライアントは送らなくてよい）。`suggestions[].category` は `words[].category`（[data.md](data.md) 3.2）と同一 enum（`mood`/`event`/`assoc`、連想語は主に `assoc`）。失敗時もクライアントは手動入力で継続可。

### 3.2 `generateDiary` — 日記文生成（たしかめる／step4）
- **用途**: 選択語群から日記本文と推定感情ラベルを生成（[screen.md](screen.md) 3.5、[data.md](data.md) 3.2）。
- **モデル**: generate（既定 `gemini-3.5-flash`、第1.3節）。
- Request:
```json
{
  "words": [
    { "text": "疲れた", "category": "mood", "source": "selected" },
    { "text": "カフェ", "category": "event", "source": "selected" },
    { "text": "友達", "category": "assoc", "source": "selected" },
    { "text": "締め切り", "category": "assoc", "source": "selected" }
  ],
  "date": "2026-07-01",
  "locale": "ja"
}
```
- Response:
```json
{
  "bodyText": "今日は晴れた午後、カフェで友達と話したけれど、締め切りが頭から離れず少し疲れた一日だった。",
  "mood": "tender",
  "promptVersion": "diary-v1"
}
```
- 備考: `mood` は3値 enum（`calm`/`tender`/`heavy`）の推定。確信を持てない/入力語が乏しい場合は `null` を返しうる（型: `"calm"|"tender"|"heavy"|null`。閾値は U 未確定、[data.md](data.md) 第4章）。本エンドポイントは**生成のみ**で保存はしない（保存はクライアントが Firestore へ書込、第4章）。

### 3.3 `adjustDiary` — 調整・再生成
- **用途**: 「もっと前向きに/短くして/詳しく」で本文を再生成（[screen.md](screen.md) 3.5）。
- **モデル**: interactive（既定 `gemini-3.1-flash-lite`、第1.3節）。
- Request:
```json
{ "bodyText": "…現在の本文…", "instruction": "positive", "locale": "ja" }
```
- `instruction`: `positive`（前向きに）/`shorter`（短く）/`detailed`（詳しく）。
- Response:
```json
{ "bodyText": "…調整後の本文…", "mood": "tender", "promptVersion": "adjust-v1" }
```

### 3.4 `chat` — AI対話（詳細画面）
- **用途**: 保存済みエントリを文脈に、寄り添い対話（[screen.md](screen.md) 3.8）。
- **モデル**: interactive（既定 `gemini-3.1-flash-lite`、第1.3節）。
- Request:
```json
{
  "entryId": "abc123",
  "message": "うん、翌日には提出できたよ",
  "history": [
    { "role": "ai", "text": "この日、締め切りのことが気になっていたんですね。今はもう落ち着きましたか？" },
    { "role": "me", "text": "…（直近数往復のみ）" }
  ]
}
```
- Response:
```json
{ "reply": "それはよかったです。1ヶ月前も同じような日に「疲れた」と書いていましたよ。", "promptVersion": "chat-v1" }
```
- 備考: サーバは必要に応じ当該エントリ本文・関連する過去の**要約**のみを補完（全件送信しない）。`history` は直近数往復に限定する（最小送信、第8章）。会話履歴の保存は U-05（既定=保存、[data.md](data.md) 3.3）。`history` の `ai`/`me` は `toLlmHistory`（`worker/src/index.ts`）で `assistant`/`user` に写像後、プロバイダ側（Gemini は `toGeminiRole`）が `model`/`user` に再写像する（第2章「ロール対応」）。`promptVersion` はテレメトリ用の返却であり、`messages`（[data.md](data.md) 3.3）には保存しない（保存する場合は data.md 側にフィールド追補が必要）。
- **初回問いかけ（空対話時）**: 履歴が空の対話を開いた際、その日のエントリ（感情・本文）を文脈に AI の最初の問いかけを生成する。`chat` の特殊系（`message` 省略）または専用の opening 呼び出しとして扱う（クライアントのモックは `chatOpening`）。応答形は `chat` と同じ `{ reply, promptVersion }`。

### 3.5 `generateInsight` — 週次/月次まとめ
- **用途**: 期間集計＋まとめ文を生成しキャッシュ（[data.md](data.md) 3.5、[screen.md](screen.md) 3.7/4.1）。**実装済み**（`worker/src/insight.ts`。要認証）。
- **モデル**: generate（既定 `gemini-3.5-flash`、第1.3節）。
- **実行主体**: 表示時のオンデマンド生成＋キャッシュ（案B、[basic-design.md](design/basic-design.md) 4.3）。**定期バッチによる事前生成は未実装**（全ユーザー列挙が要るため。オンデマンド＋キャッシュで代替。§10 実装状況）。
- Request:
```json
{ "type": "monthly", "periodKey": "2026-07" }
```
  - `type`: `weekly` / `monthly` / `quarterly` 以外は `invalid-argument`。
  - `periodKey`: `weekly` は `YYYY-Www`（ISO8601 週・月曜始まり）、`monthly` / `quarterly` は `YYYY-MM`。形式不正、および**その年に存在しない第53週**は `invalid-argument`。
  - `quarterly`（過去3ヶ月・[screen.md](screen.md) 4.1）: `periodKey` は**末尾の月**（`YYYY-MM`、通常は今月）を表し、その月を含む**直近3ヶ月**（末尾月＋前2ヶ月、年跨ぎ可）を集計する。暦上の四半期ではない。`periodId` は `quarterly_YYYY-MM`（`monthly_YYYY-MM` とは別キー）。
- Response（`users/{uid}/insights/{periodId}` に保存される内容と同型）:
```json
{
  "type": "monthly",
  "periodKey": "2026-07",
  "rangeStart": "2026-07-01",
  "rangeEnd": "2026-07-31",
  "moodDistribution": { "calm": 40, "tender": 35, "heavy": 25 },
  "topWords": [ { "word": "疲れた", "count": 12 }, { "word": "カフェ", "count": 9 } ],
  "narrative": "7月は「疲れた」という言葉が目立つ月でした。…",
  "generatedAt": "2026-08-01T00:00:00Z",
  "source": { "model": "claude-sonnet-5" },
  "schemaVersion": 1
}
```
- 備考: 集計は Firestore の `entries` からサーバが算出（クライアントは算出しない）。`weekly` はモバイル⑥にも表示、`monthly` は Web 限定。保存時にサーバが `periodId`（`type_periodKey`、[data.md](data.md) 3.5）と `schemaVersion` を付与する。
- **`moodDistribution` は百分率**（整数・合計100）。`mood` が null のエントリは母数から除外し、1件も `mood` が無ければ全て 0 を返す。端数は最大剰余法で配分する。
- **`topWords` は最大10件**。同一エントリ内の重複語は1回として数え、件数降順・同数は語の昇順で安定させる。
- **キャッシュ**: `users/{uid}/insights/{periodId}` を参照し、**期間が確定していれば永続的に再利用**、それ以外は生成から1時間で作り直す。`generatedAt` が壊れている場合も再生成する。
  - 確定判定は「`rangeEnd` が UTC の今日より**1日以上前**」（`worker/src/insight.ts` の `PERIOD_CLOSE_GRACE_MS`）。`entries.date` は端末ローカル日付で、Worker 側は UTC しか持たないため、UTC より遅れたタイムゾーンの端末が期間最終日にいる間に確定扱いしてしまわないよう猶予を置く。猶予中は上記1時間 TTL で再生成される。
- **エラー**: 期間内にエントリが1件も無い場合は `failed-precondition`（LLM は呼ばない）。
- **プライバシー**: LLM へ渡すのは集計値（`moodDistribution` / `topWords` / `entryCount` / 期間）のみで、**日記本文（`bodyText`）は送らない**。Firestore からの読み出しも `date`/`mood`/`words` のみに射影する（最小送信・最小取得、第8章・[constraints.md](../.claude/rules/constraints.md)）。

---

## 4. 書込・保存の扱い

- 日記の**保存はクライアントが Firestore へ直接書込**（`users/{uid}/entries`、[data.md](data.md) 3.2）。生成系 Functions は本文を返すのみで保存しない（責務分離・オフライン保存対応）。
- 保存後の `wordStats` 更新と `insights` 無効化/再生成は当初 **Functions（Firestore トリガ）** を想定していたが、Cloud Functions 不採用（Blaze 回避）のためトリガは存在しない。**実装（Phase4）では `generateInsight` 呼び出し時に `entries` から都度集計し、キャッシュ鮮度（3.5）で再生成を制御する**。`wordStats` は現状どこからも書き込まれない（[data.md](data.md) 3.4）。クライアントが `wordStats`/`insights` を書けない点は不変（[data.md](data.md) 第6章）。

---

## 5. QR ペアリング

短命トークン方式（[architecture.md](architecture.md) 3.4、[data.md](data.md) 3.6）。

> **実装メモ（Phase3・実装済み）**: 本節は Callable/Functions 前提の記法だが、実装は Cloudflare Workers（`worker/src/pairing.ts`）。`context.auth` は Worker の ID トークン検証で得た uid に、カスタムトークン発行・Firestore Admin アクセスは Firebase サービスアカウント秘密鍵（`FIREBASE_SERVICE_ACCOUNT`）を用いた WebCrypto 署名・Firestore REST に読み替える（§10 実装状況、[worker/README.md](../worker/README.md)）。エラー応答は `{ error: { code, message } }` + HTTP ステータス。

### 5.1 `createPairingToken` — 発行（モバイル、要認証）
- Request: `{}`（uid は `context.auth`）。
- Response:
```json
{ "token": "<ランダム>", "expiresAt": "2026-07-07T12:01:00Z", "ttlSeconds": 60 }
```
- 備考: `pairings/{token}` を作成（`uid`,`expiresAt`,`consumed:false`）。`expiresAt` は Firestore では `timestamp`（[data.md](data.md) 3.6）だが、レスポンスでは ISO8601 文字列に変換して返す（第3章共通ルール）。60秒ごとにクライアントが再発行し QR 更新（`.qr-timer-label`）。

### 5.2 `verifyPairingToken` — 照合（Web、未サインイン可）
- Request: `{ "token": "<QRで読取>" }`。
- 処理: `expiresAt > now` かつ `consumed == false` を検証 → `consumed = true` にして**カスタム認証トークン**を発行。
- Response:
```json
{ "customToken": "<Firebase custom token>", "uid": "…" }
```
- エラー: 失効/使用済/不正は `failed-precondition`（Web は再取得を促す、[screen.md](screen.md) 4.2）。
- Web は `signInWithCustomToken(customToken)` でサインイン。**実装済み**（Web 側 `web/src/lib/pairing.ts`。`web/src/app/pair`＝QR ディープリンク着地、`web/src/app/connect`＝カメラでの QR ライブ読取＋コード貼り付け導線）。

---

## 6. アカウント・データ削除

### 6.1 `deleteAccount` — アカウント削除（要認証）
- 処理: `users/{uid}` サブツリーを再帰削除（`entries`＋`messages`＋`wordStats`＋`insights`）、`pairings` の当該 uid を削除、Auth ユーザー削除（[data.md](data.md) 第7章）。**実装済み**（`worker/src/account.ts`）。
- Request: `{}`（uid は ID トークンから確定。クライアントは削除対象を指定できない）。
- Response: `{ "deleted": true }`。
- 冪等: 途中失敗時も再実行で完了できるようにする。
- **削除順序**: Firestore サブツリー → `pairings` → Auth ユーザー の順。**Auth を最後にする**のは、途中で失敗しても同じ uid・ID トークンで再実行できるようにするため（Auth を先に消すと、本人が再認証できずデータだけ残る孤児状態になる）。
- **冪等性の担保**: Firestore の delete は存在しないドキュメントに対して no-op。Auth ユーザー削除は `USER_NOT_FOUND` を成功として扱う。
- 日記単体削除はクライアントが `entries/{id}`＋`messages` を削除する（`wordStats` 再集計は Cloud Functions トリガ前提のため現状行われない。3.4 の実装メモ参照）。

---

## 7. レート制限・リトライ・タイムアウト

- **クライアント再試行**: `unavailable`/`deadline-exceeded`/`resource-exhausted` のみ指数バックオフで数回。入力・下書きは保持。
- **サーバ**: Gemini 呼び出しに `generationConfig.maxOutputTokens` の上限とタイムアウト（25秒/試行）を設定。Gemini 側レート超過は `resource-exhausted` に写像（`worker/src/llm/gemini.ts`）。
- **サーバ側リトライ**: Gemini の 5xx（過負荷。生ステータスに関わらず `unavailable`/503 に正規化される）は初回失敗時に600ms待って**1回だけ**自動リトライする（合計最大2試行）。429（レート制限）・400/401/403、およびクライアント側タイムアウト（`AbortController` 由来の `deadline-exceeded`/504・ネットワーク断）はリトライ対象外（待っても状況が変わりにくいため）。**理論上の最大待ち時間**は 1試行あたりのタイムアウト25秒×合計2試行＋リトライ待機0.6秒 ≒ 50.6秒（実運用では5xx応答自体は速いため通常はここまで伸びない）。
- **多重防止**: 保存・削除・ペアリング消費はサーバ側で状態（`consumed` 等）を検証し二重実行を防ぐ。

---

## 8. プライバシー・ログ方針
- AI へは当該処理に必要な最小限のみ送信（当ステップの語・当日文脈・必要な過去要約）。全件・個人特定情報は送らない。
- 日記本文・AI 送受信ペイロードを**ログに残さない**。ログはメタ情報（関数名・uid ハッシュ・所要時間・エラーコード）に限定。
- モデル/プロンプト版は `source.model`/`promptVersion` として保存し追跡可能にする（本文とは別）。
- すべて uid スコープ、最小権限（[constraints.md](../.claude/rules/constraints.md)）。

---

## 9. 要件・設計トレース
| 本書の項目 | 対応元 |
|---|---|
| Functions 経由・キー秘匿 | [constraints.md](../.claude/rules/constraints.md)／[environments.md](../.claude/rules/environments.md)／Notion §4.2/§8 |
| 連想/生成/調整/対話/まとめ | [screen.md](screen.md) 3.4/3.5/3.8/3.7・4.1／[data.md](data.md) |
| QR 短命トークン(60s) | `visual-design.html` `.qr-timer-label`／[data.md](data.md) 3.6 |
| 削除（関連含む） | [data.md](data.md) 第7章／Notion §8 |
| 感情 enum・集計 | [data.md](data.md) 第4章／`visual-design.html` `.legend`/`.mood-chart`/`.word-rank` |

---

## 10. 未確定・申し送り

### 実装状況（Phase2・AI 実接続）
- **実装済み（Cloudflare Workers / `worker/`）**: `suggestWords`・`generateDiary`・`adjustDiary`・`chat`・`chatOpening`。**Firebase Blaze プラン回避のため Firebase Functions ではなく Cloudflare Workers を採用**（Firebase は Spark プランのまま。[environments.md](../.claude/rules/environments.md)／[worker/README.md](../worker/README.md)）。認証は Firebase ID トークン（`Authorization: Bearer`）を Worker 側が `jose` で検証（Firebase Admin SDK 不使用）。
- **LLM プロバイダ（2026-07-09 変更）**: 当初 Anthropic（Claude Haiku 4.5 / Sonnet 5）で実装したが、**課金を発生させず無料枠で運用したい**というユーザー方針により **Google Gemini API**（Gemini Developer API・無料枠）へ変更した。API キーは Cloudflare Secret（`GEMINI_API_KEY`）、モデルは環境変数（`GEMINI_MODEL_INTERACTIVE`/`GEMINI_MODEL_GENERATE`）で差し替え。生成系（suggest/generate/adjust）は Gemini の **構造化出力（`responseSchema`/`responseMimeType: application/json`）** で JSON を強制。クライアントは `isClaudeWorkerConfigured`（`EXPO_PUBLIC_CLAUDE_WORKER_URL` の有無）で **モック↔Worker を自動切替**（`src/services/diaryApi.ts`）。
- **LLM プロバイダ抽象（移管容易化）**: Worker 側の LLM 呼び出しは `worker/src/llm/`（`types.ts`=`LlmProvider` インターフェース／`gemini.ts`=Gemini 実装／`index.ts`=`LLM_PROVIDER` によるセレクタ）に抽象化済み。`worker/src/index.ts` は用途（`purpose: 'interactive'|'generate'`）を指定するのみでモデル ID・プロバイダ固有仕様に依存しない。**将来 Anthropic 等へ移管する場合はプロバイダ実装を1ファイル追加＋セレクタに分岐追加のみ**（詳細は [worker/README.md](../worker/README.md) の「LLM プロバイダ抽象」）。worker のユニットテスト（vitest）は `worker/src/**/__tests__/`。
- **QRペアリング（実装済み・Phase3）**: `createPairingToken`（要認証。60秒の短命トークンを `pairings` に作成）・`verifyPairingToken`（未サインイン可。照合・消費しカスタムトークンを返す）を Cloudflare Workers で実装（`worker/src/pairing.ts`）。**カスタムトークン発行と Firestore Admin アクセスのため Firebase サービスアカウント秘密鍵（`FIREBASE_SERVICE_ACCOUNT` Secret）を導入**。Firebase Admin SDK は使わず、WebCrypto（RS256）で JWT を自前署名（`worker/src/serviceAccount.ts`）、Firestore REST（Admin アクセストークン）で `pairings` を照合・消費（`worker/src/firestore.ts`）。二重消費は `updateTime` precondition で防止。`firestore.rules` は `pairings` へのクライアント直接アクセスを全面禁止（Admin のみ）。モバイルは `WebConnectScreen` で60秒ごとに QR を再発行（`src/services/pairing.ts`）。**Web 側の照合UI（`verifyPairingToken` 呼び出し・`signInWithCustomToken`）は実装済み（Phase4・`web/`）**: `web/src/lib/pairing.ts`（照合→サインイン）、`web/src/app/pair`（QR ディープリンク着地点）、`web/src/app/connect`（カメラでの QR ライブ読取＋コード貼り付け導線）。**「または＋Apple/Google サインイン」代替導線（[screen.md](screen.md) 3.10/4.2）は Web 側実装済み**（`web/src/lib/oauth.ts`・`web/src/app/connect`。`signInWithPopup` で Google/Apple サインイン）。**モバイル側の昇格ロジック（`linkWithCredential`）およびネイティブ資格情報取得（Apple/Google サインインUI＝`nativeCredentialSource.ts`／`installNativeCredentialSource`）はともに実装済み**だが、後者の有効化は**開発ビルド前提**（ネイティブモジュール要・Expo Go では未適用で `OAuthCredentialSource` シーム未差し替え）のため、開発ビルドで `installNativeCredentialSource()` を呼びユーザーが**モバイルで先に昇格**するまでは、未リンクの資格情報でサインインすると新規（空）アカウントになる（[environments.md](../.claude/rules/environments.md) の「Apple/Google サインインへの昇格」参照）。`expiresAt` はレスポンスでミリ秒付き ISO8601（`toISOString()`）を返す（5.1 のサンプルはミリ秒省略表記だが、いずれも有効な ISO8601）。
- **週次/月次まとめ（実装済み・Phase4）**: `generateInsight`（3.5）を Cloudflare Workers で実装（`worker/src/insight.ts`）。**表示時オンデマンド生成＋キャッシュ**方式（basic-design.md 4.3 案B の折衷のうち、定期バッチ側は未実装）。集計は Firestore REST（Admin）の `runQuery` で `users/{uid}/entries` を `date` 範囲検索して算出し（`worker/src/firestore.ts` の `queryEntriesByDateRange`、`select` で `date`/`mood`/`words` のみ射影）、結果を `users/{uid}/insights/{periodId}` へ Admin 権限で保存する（`saveInsight`。クライアントは `firestore.rules` により書込不可）。**LLM へ送るのは集計値のみで日記本文は送らない**。`source.model` 記録のため `LlmProvider` に `modelFor(purpose)` を追加した（`worker/src/llm/types.ts`）。**定期バッチ（Cron Triggers）による事前生成は未実装**（全ユーザー列挙が必要で、Workers から `users` コレクション全走査は費用・権限設計の検討が要るため。オンデマンド＋キャッシュで実用上は充足）。`wordStats`（data.md 3.4）は Cloud Functions トリガ前提の集計先で、現状どこからも更新されないため参照していない。
- **アカウント削除（実装済み・Phase4）**: `deleteAccount`（第6章）を Cloudflare Workers で実装（`worker/src/account.ts`）。Firebase Admin SDK の `recursiveDelete()` は使えないため、**collection group クエリ**（`runQuery` の `from[].allDescendants=true`）でコレクション ID ごとに任意の深さの子孫を1回で集め、`documents:commit`（バッチ書込・500件ずつ）で一括削除する（`worker/src/firestore.ts` の `deleteUserData`）。
  - **ドキュメントを1件ずつ再帰的に辿らない理由**: Cloudflare Workers には「1リクエストあたりのサブリクエスト数」上限（無料プランで50）があり、素朴な再帰では日記の件数に比例して Firestore 呼び出しが増え、エントリが数十件を超えると上限に達する。collection group クエリならデータ量によらず**コレクション ID の数だけの呼び出し（数回）で一定**になる。
  - 取得は `select: ['__name__']`（キーのみ射影）で、**日記本文は一切読まない**。
  - 対象コレクション ID は既知スキーマ（`entries`/`messages`/`wordStats`/`insights`。3.2〜3.5）を用いる。`users/{uid}` 直下に未知のコレクションがあれば `listCollectionIds` で検出して削除対象に加える（さらに深い階層の未知コレクションは検出できない。スキーマ変更時は上記の定数も更新すること）。
  - `pairings` は `uid` の `runQuery`（`select: __name__`）で該当文書のみ削除。
  - Auth ユーザー削除は Identity Toolkit Admin API（`accounts:delete`）を呼ぶため、**`datastore` とは別に `identitytoolkit` スコープのアクセストークン**を取得する（`worker/src/serviceAccount.ts` の `getIdentityToolkitAccessToken`。トークンはスコープごとにキャッシュ）。
  - 削除順序と冪等性は 6.1 を参照。**設定画面の削除導線 UI は未実装**（[screen.md](screen.md) 3.9 で「将来」の扱い。クライアントの API 層 `src/services/account.ts` のみ用意）。
- **Web ダッシュボード（実装済み・Phase4）**: `web/`（Next.js・静的エクスポート／Firebase Hosting 前提）。QRペアリング照合でサインイン（5.2）し、`generateInsight`（3.5）から週次/月次まとめを取得して感情推移・よく使う言葉・AIまとめを表示する（閲覧専用・U-09）。Worker の API は既存のものを Web クライアント（`web/src/lib/worker.ts`）から呼ぶだけで、Worker 側の追加実装は不要。配色・型は `shared/`（`shared/theme/tokens.ts`・`shared/types/*`）をモバイルと共有。日記本文の閲覧（`/entries`・Firestore 直読）・Hosting デプロイ設定（`firebase.json`/`.firebaserc`）・カメラ QR ライブ読取（`/connect`）・`/entries` の検索/無限スクロール・Apple/Google サインイン代替（`/connect`・`web/src/lib/oauth.ts`）・「過去3ヶ月」タブ（`generateInsight` の `type: 'quarterly'`・`worker/src/insight.ts`）も実装済み。**モバイル側の匿名アカウント→Apple/Google リンク昇格ロジック・ネイティブ資格情報取得ともに実装済み**（`src/services/auth`：`firebaseAuthProvider.linkWith`＝`linkWithCredential`／`authStore.linkAccount`／`WebConnectScreen` の導線／`nativeCredentialSource.ts`＝Apple・Google 資格情報取得の中核＋`nativeCredentialSourceInstall.ts` の `installNativeCredentialSource()`。エラーは `AuthLinkError` へ写像）。**有効化条件（後続の運用作業）**: ネイティブ資格情報取得の有効化には**開発ビルド**が必要（`expo-apple-authentication`／`@react-native-google-signin` 等のネイティブモジュール要）。開発ビルドの起動エントリで `installNativeCredentialSource()` を呼び、Google は `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` を設定、Firebase Console でプロバイダ有効化する。Expo Go 既定パスは同関数を読み込まないため `canLinkAccount` false で導線非表示（[web/README.md](../web/README.md)・[architecture.md](architecture.md) 第6章）。
- **未対応（将来）**: `chat` のサーバ側文脈補完（当該エントリ本文・過去要約）は現状クライアントの直近履歴のみを送信。ストリーミングは未採用（非ストリーミング＋`maxOutputTokens` 上限）。

### 未確定
- **U-12（改定）**: モデルは当初 Claude（連想/対話/調整=Haiku 4.5、生成/まとめ=Sonnet 5）を決定していたが、無料運用のため **Gemini（連想/対話/調整=`gemini-3.1-flash-lite`、生成/まとめ=`gemini-3.5-flash`）に変更**（環境変数で差し替え可）。コスト上限（将来 Anthropic 等へ戻す場合）は運用で監視。
- **U-05（決定）**: 対話履歴は**保存する**（`chat` の応答を `messages` に保存、[data.md](data.md) 3.3）。
- **U-06（決定）**: 連想は `suggestWords`（**都度 AI＋傾向**）に集約。候補チップ初期は固定辞書＋傾向差し替え。
- **プロンプト設計の詳細**（system/few-shot、`promptVersion` 運用）は Notion 要件（プロンプト設計方針）と本書を突き合わせて確定（残）。
- **感情推定の閾値・自由語→enum 写像**の具体規則（[data.md](data.md) 第4章と連動）。
- **ストリーミング**採否（対話/生成の体感改善）。
- **モデルの環境変数化（反映済）**: [environments.md](../.claude/rules/environments.md) に用途別モデルと環境変数（`GEMINI_MODEL_INTERACTIVE`/`GEMINI_MODEL_GENERATE`）の設定項目を追記済み。

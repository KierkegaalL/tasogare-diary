# たそがれ日記 詳細設計：API仕様（api-contract.md）

> **位置づけ**: ステップ3（詳細設計）。[architecture.md](architecture.md) の構成、[data.md](data.md) のスキーマ、[screen.md](screen.md) の画面要件を前提に、**Firebase Functions のエンドポイント仕様**、**Claude API 連携のリクエスト/レスポンス**、**認証方式**を定義する。
> **要件の正**: Notion [たそがれ日記 要件定義書](https://app.notion.com/p/395cd5c5312e81b0b73fc2d95219b084)。
> **技術選定**: 要件に明記が無いものは「案A/案B＋推奨」で提示し断定しない。

---

## 1. 全体方針

- **Claude API はクライアント直叩き禁止**。すべて **Firebase Functions を経由**する（[constraints.md](../.claude/rules/constraints.md)／[environments.md](../.claude/rules/environments.md)）。API キーは Functions の秘密（Secrets/config）にのみ保持。
- **最小送信**: Claude へは応答生成に必要な最小限のみ送る。日記本文・送信ペイロード・個人特定情報を**ログに残さない**（第8章）。
- **冪等性**: 生成系は非冪等（都度生成）。書込系（保存・削除・ペアリング消費）は二重実行に耐える設計とする。

### 1.1 呼び出し方式（案・推奨）
- **推奨**: **Callable Functions**（`httpsCallable`）。Firebase SDK が ID トークンを自動付与し、`context.auth` で uid を取得できる。CORS/認証の実装が簡潔。
- 案B: `onRequest`（HTTP）＋ `Authorization: Bearer <IDトークン>` を手動検証。Web からの細かい制御が要る場合に選択。
- 本書は Callable 前提で記述する（Web ダッシュボードも Firebase SDK 利用）。

### 1.2 認証
| 対象 | 認証 |
|---|---|
| 生成系・書込系・削除 | Firebase Auth（Apple/Google）。`context.auth.uid` 必須。未認証は `unauthenticated` |
| QR ペアリング照合（Web 初回） | 未サインインでも可。短命トークンを検証しカスタムトークンを返す（第5章） |

- リソースは常に呼び出し元 uid にスコープ（他者データへのアクセス不可）。

### 1.3 Claude モデル選定（U-12・決定）
| 用途 | モデル（確定） | 理由 |
|---|---|---|
| 連想語提案 / AI対話 / 調整 | **Claude Haiku 4.5**（`claude-haiku-4-5-20251001`） | 低遅延・低コスト。対話/インタラクションの体感を軽く保つ |
| 日記文生成 / 週次・月次まとめ | **Claude Sonnet 5**（`claude-sonnet-5`） | 文章の質・寄り添いの表現力を優先 |

- 不採用の代替案（参考）: まとめ生成のみ上位（Opus 4.8 `claude-opus-4-8`）を用いる案も検討したが、コストと品質のバランスで Sonnet 5 を採用。モデルは環境変数（[environments.md](../.claude/rules/environments.md)）で差し替え可能にする。

### 1.4 共通エラー形式
Callable は Firebase の標準エラーコードを用いる。

| code | 意味 | 例 |
|---|---|---|
| `unauthenticated` | 未認証 | ID トークン無し |
| `invalid-argument` | 入力不正 | 必須欠落・型不一致 |
| `resource-exhausted` | レート/クォータ超過 | Claude レート、関数同時実行 |
| `unavailable` | 一時障害 | Claude 一時エラー、ネットワーク |
| `deadline-exceeded` | タイムアウト | 生成が上限超過 |
| `permission-denied` | 権限外 | 他者リソース |
| `internal` | 内部エラー | 想定外 |

- クライアントは `unavailable`/`deadline-exceeded`/`resource-exhausted` を再試行対象とし、入力・下書きは保持（[screen.md](screen.md) 0.3）。

---

## 2. Claude 連携の内部仕様（Functions → Claude）

- **エンドポイント**: Anthropic Messages API（`POST https://api.anthropic.com/v1/messages`）。ヘッダ `x-api-key`（Secrets）、`anthropic-version`。
- **共通パラメータ**: `model`（第1.3節）、`max_tokens`（用途別上限）、`system`（役割・トーン・安全方針）、`messages`。
- **system プロンプト方針（要点）**: 「たそがれ時に心を整える、静かで温かい伴走者。共感的に、短く、断定や診断をしない。日本語」。プロンプトのバージョンを `promptVersion` として `entries.source`／`insights.source` に記録（本文送信内容自体はログ化しない）。
- **ロール対応**: 保存モデルの `ai`/`me`（[data.md](data.md)）↔ Claude の `assistant`/`user` に写像する（用語統一）。
- **タイムアウト**: 関数側でストリーミング or 上限 `max_tokens` を設定し、`deadline-exceeded` を制御。

> 送信は最小限（当該ステップの選択語・当日文脈・必要な過去要約のみ）。過去全件や個人特定情報は送らない（第8章）。

---

## 3. 生成系エンドポイント

> すべて Callable。認証必須（`context.auth.uid`）。リクエストは `data`、レスポンスは `result`。日時は ISO8601、`date` は `YYYY-MM-DD`。

### 3.1 `suggestWords` — 連想語提案（ことば／step3）
- **用途**: きもち・できごと＋傾向から連想語候補を返す（[screen.md](screen.md) 3.4）。
- **モデル**: Haiku 4.5。
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
- **モデル**: Sonnet 5。
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
- **モデル**: Haiku 4.5。
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
- **モデル**: Haiku 4.5。
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
- 備考: サーバは必要に応じ当該エントリ本文・関連する過去の**要約**のみを補完（全件送信しない）。会話履歴の保存は U-05（既定=保存、[data.md](data.md) 3.3）。`history` の `ai`/`me` は Claude 側で `assistant`/`user` に写像。`promptVersion` はテレメトリ用の返却であり、`messages`（[data.md](data.md) 3.3）には保存しない（保存する場合は data.md 側にフィールド追補が必要）。

### 3.5 `generateInsight` — 週次/月次まとめ
- **用途**: 期間集計＋まとめ文を生成しキャッシュ（[data.md](data.md) 3.5、[screen.md](screen.md) 3.7/4.1）。
- **モデル**: Sonnet 5。
- **実行主体**: 定期バッチ（日次 or 期間確定時）＋Web 表示時のオンデマンド（案B、[basic-design.md](design/basic-design.md) 4.3）。
- Request:
```json
{ "type": "monthly", "periodKey": "2026-07" }
```
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
- 備考: 集計は Firestore の `entries`/`wordStats` からサーバが算出（クライアントは算出しない）。`weekly` はモバイル⑥にも表示、`monthly` は Web 限定。保存時に Functions が `periodId`（`type_periodKey`、[data.md](data.md) 3.5）と `schemaVersion` を付与する。

---

## 4. 書込・保存の扱い

- 日記の**保存はクライアントが Firestore へ直接書込**（`users/{uid}/entries`、[data.md](data.md) 3.2）。生成系 Functions は本文を返すのみで保存しない（責務分離・オフライン保存対応）。
- 保存後、`wordStats` 更新と `insights` 無効化/再生成は **Functions（Firestore トリガ）** が担う（クライアントは `wordStats`/`insights` を書けない：[data.md](data.md) 第6章）。

---

## 5. QR ペアリング

短命トークン方式（[architecture.md](architecture.md) 3.4、[data.md](data.md) 3.6）。

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
- Web は `signInWithCustomToken(customToken)` でサインイン。

---

## 6. アカウント・データ削除

### 6.1 `deleteAccount` — アカウント削除（要認証）
- 処理: `users/{uid}` サブツリーを `recursiveDelete`（`entries`＋`messages`＋`wordStats`＋`insights`）、`pairings` の当該 uid を削除、Auth ユーザー削除（[data.md](data.md) 第7章）。
- Response: `{ "deleted": true }`。
- 冪等: 途中失敗時も再実行で完了できるようにする。
- 日記単体削除はクライアントが `entries/{id}`＋`messages` を削除し、`wordStats` 再集計を Functions が実施。

---

## 7. レート制限・リトライ・タイムアウト

- **クライアント再試行**: `unavailable`/`deadline-exceeded`/`resource-exhausted` のみ指数バックオフで数回。入力・下書きは保持。
- **サーバ**: Claude 呼び出しに上限 `max_tokens` とタイムアウトを設定。Claude 側レート超過は `resource-exhausted` に写像。
- **多重防止**: 保存・削除・ペアリング消費はサーバ側で状態（`consumed` 等）を検証し二重実行を防ぐ。

---

## 8. プライバシー・ログ方針
- Claude へは当該処理に必要な最小限のみ送信（当ステップの語・当日文脈・必要な過去要約）。全件・個人特定情報は送らない。
- 日記本文・Claude 送受信ペイロードを**ログに残さない**。ログはメタ情報（関数名・uid ハッシュ・所要時間・エラーコード）に限定。
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
- **U-12（決定）**: モデルは**連想/対話/調整=Haiku 4.5、生成/まとめ=Sonnet 5**（環境変数で差し替え可）。コスト上限は運用で監視（実装で確定）。
- **U-05（決定）**: 対話履歴は**保存する**（`chat` の応答を `messages` に保存、[data.md](data.md) 3.3）。
- **U-06（決定）**: 連想は `suggestWords`（**都度 Claude＋傾向**）に集約。候補チップ初期は固定辞書＋傾向差し替え。
- **プロンプト設計の詳細**（system/few-shot、`promptVersion` 運用）は Notion 要件（プロンプト設計方針）と本書を突き合わせて確定（残）。
- **感情推定の閾値・自由語→enum 写像**の具体規則（[data.md](data.md) 第4章と連動）。
- **ストリーミング**採否（対話/生成の体感改善）。
- **モデルの環境変数化（反映済）**: [environments.md](../.claude/rules/environments.md) に用途別モデルと環境変数（`CLAUDE_MODEL_INTERACTIVE`/`CLAUDE_MODEL_GENERATE`）の設定項目を追記済み。

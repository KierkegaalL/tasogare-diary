# worker — たそがれ日記 AI連携プロキシ（Cloudflare Workers）

AI（現在は **Google Gemini API**）へのアクセスを **Cloudflare Workers 経由**で提供する。API キーはクライアントに埋め込まず、Worker の Secret にのみ保持する（[constraints.md](../.claude/rules/constraints.md) / [api-contract.md](../docs/api-contract.md)）。

**Firebase Blaze プランを使わず Spark プラン（無料枠）を維持する**ための構成。Firebase Functions（Cloud Functions）は世代を問わず Blaze プラン必須のため、AI 連携のプロキシ部分のみ Cloudflare Workers（クレジットカード登録不要の無料枠あり）に置く。Firestore / Authentication は引き続き Firebase（Spark）を使う。

> **LLM プロバイダについて**: 当初 Anthropic（Claude）を想定していたが、**無料での運用を優先**し Google Gemini API（Gemini Developer API・無料枠）に変更した（ユーザー判断）。ルーティング・認証・エラー設計（[src/index.ts](src/index.ts)）はプロバイダ非依存で、呼び出し実装（[src/llm/](src/llm/)）のみを差し替えれば将来 Anthropic 等へ戻すことも可能（下記「LLM プロバイダ抽象」参照）。

## LLM プロバイダ抽象（別 API への移管を容易にする設計）

LLM 呼び出しは `src/llm/` にプロバイダ非依存の抽象として実装している。**別 API（Anthropic 等）へ移管する際に `src/index.ts`（ルーティング/バリデーション/プロンプト）を変更せずに済む**ことを目的とする。

| ファイル | 役割 |
|---|---|
| [src/llm/types.ts](src/llm/types.ts) | プロバイダ非依存の型・インターフェース（`LlmProvider`）・共通エラー（`ApiError`）。`callText`/`callJson`、用途（`purpose: 'interactive' \| 'generate'`）、履歴ロール（`user`/`assistant`）、構造化出力スキーマ（OpenAPI 3.0 風サブセット）を定義 |
| [src/llm/gemini.ts](src/llm/gemini.ts) | Gemini 実装（`createGeminiProvider`）。モデル解決・ロール写像（`assistant`→`model`）・fetch・タイムアウト・エラー写像・構造化出力を内包 |
| [src/llm/index.ts](src/llm/index.ts) | セレクタ（`getLlmProvider`）。`LLM_PROVIDER` 環境変数（既定 `gemini`）で切替 |

**別プロバイダの追加手順**:
1. `src/llm/<provider>.ts` に `LlmProvider` を満たす `create<Provider>Provider(env)` を実装（各社 API のリクエスト形・ロール名・構造化出力・エラー写像を吸収する）
2. `src/llm/index.ts` の `getLlmProvider` の `switch` に分岐を追加
3. `wrangler secret put <PROVIDER>_API_KEY` でキーを登録し、`LLM_PROVIDER` を切替

`index.ts` は `purpose`（interactive/generate）でモデル階層を指定するのみで、具体的なモデル ID・プロバイダ固有仕様には依存しない。

## 実装済みエンドポイント（要 Firebase ID トークン）

| パス | 用途 | モデル（既定） | 対応（api-contract.md） |
|---|---|---|---|
| `POST /suggestWords` | 連想語提案 | `gemini-3.1-flash-lite` | 3.1 |
| `POST /generateDiary` | 日記文生成 | `gemini-3.5-flash` | 3.2 |
| `POST /adjustDiary` | 調整・再生成 | `gemini-3.1-flash-lite` | 3.3 |
| `POST /chat` | AI対話 | `gemini-3.1-flash-lite` | 3.4 |
| `POST /chatOpening` | 初回問いかけ | `gemini-3.1-flash-lite` | 3.4 |
| `POST /generateInsight` | 週次/月次まとめ（集計＋文章化＋キャッシュ） | `gemini-3.5-flash` | 3.5 |

- `generateInsight` は Firestore REST（Admin）で `users/{uid}/entries` を期間集計し、`users/{uid}/insights/{periodId}` にキャッシュする（`src/insight.ts`）。**サービスアカウント秘密鍵（`FIREBASE_SERVICE_ACCOUNT`）が必須**。表示時オンデマンド生成で、期間終了後は永続キャッシュ・進行中は1時間で再生成。**LLM へ渡すのは集計値のみで日記本文は送らない**。
- Gemini の 5xx（過負荷）は `src/llm/gemini.ts` が1回だけ自動リトライする（合計最大2試行、api-contract.md 第7章）。429/400/401/403 やクライアント側タイムアウトはリトライしない。

### QRペアリング（LLM 非依存 / api-contract.md 第5章）

| パス | 用途 | 認証 |
|---|---|---|
| `POST /createPairingToken` | 短命トークン（60秒）発行→ pairings に作成 | 要 Firebase ID トークン |
| `POST /verifyPairingToken` | トークン照合・消費→ カスタムトークン発行 | **未サインイン可**（Web 初回） |

- `verifyPairingToken` はカスタムトークン発行のため **Firebase サービスアカウント秘密鍵**（`FIREBASE_SERVICE_ACCOUNT`）が必須（下記）。`src/serviceAccount.ts` が WebCrypto（RS256）で自前署名し、`src/firestore.ts` が Firestore REST（Admin）で pairings を照合・消費する。

### アカウント削除（LLM 非依存 / api-contract.md 第6章）

| パス | 用途 | 認証 |
|---|---|---|
| `POST /deleteAccount` | `users/{uid}` サブツリー → pairings → Auth ユーザー を削除 | 要 Firebase ID トークン |

- **サービスアカウント秘密鍵（`FIREBASE_SERVICE_ACCOUNT`）が必須**。Firestore REST（Admin）と Identity Toolkit REST（Admin）の**2つのスコープ**でアクセストークンを取得する（`datastore` / `identitytoolkit`）。
- `firebase-admin` の `recursiveDelete()` は使えないため、collection group クエリ（`allDescendants=true`）で子孫をまとめて集め、`documents:commit` で一括削除する（`src/firestore.ts` の `deleteUserData`）。**Cloudflare Workers のサブリクエスト上限（無料プランで50）**に達しないよう、Firestore への呼び出し回数は日記の件数によらず一定にしている。
- **冪等**: 途中失敗しても再実行で完了できる（Auth を最後に消すため ID トークンが有効なまま。詳細は api-contract.md 6.1）。
- クライアントの UI 導線は未実装（screen.md 3.9 で「将来」）。API 層は `src/services/account.ts`。

> 未実装（別タスク）: `generateInsight` の定期バッチ事前生成（Cron Triggers）、`chat` のサーバ側文脈補完（当該エントリ本文/過去要約）。

## 認証方式

Firebase Callable（`context.auth`）の代わりに、クライアントが取得した **Firebase ID トークン**を `Authorization: Bearer <IDトークン>` で送る。Worker 側は Firebase Admin SDK を使わず、サードパーティ JWT ライブラリ（[`jose`](https://github.com/panva/jose)）で Google の公開鍵（JWKS）を用いて検証する（[src/auth.ts](src/auth.ts)、Firebase 公式手順「Verify ID tokens using a third-party JWT library」に準拠）。

## 前提

- Cloudflare アカウント（無料枠。クレジットカード登録不要）。
- **Gemini API キー**（無料）を [Google AI Studio](https://aistudio.google.com/apikey) で発行し、Worker の Secret に登録する。
- `FIREBASE_PROJECT_ID`（`wrangler.jsonc` の `vars`、公開可能な値）をクライアントの `EXPO_PUBLIC_FIREBASE_PROJECT_ID` と一致させる。
- **QRペアリングを使う場合のみ**: Firebase Console →「プロジェクトの設定」→「サービス アカウント」→「新しい秘密鍵の生成」で JSON をダウンロードし、`FIREBASE_SERVICE_ACCOUNT` Secret として登録する（無料枠のまま利用可。カスタムトークン発行と Firestore Admin アクセスに使用）。

## セットアップ

```bash
# 1) 依存インストール
npm --prefix worker install

# 2) 型チェック
npm --prefix worker run typecheck

# 3) Cloudflare にログイン（初回のみ）
npx wrangler login

# 4) Gemini API キーを Secret に登録（対話プロンプトで直接貼り付ける。ファイル/パイプ経由は
#    改行混入の原因になるため避ける）
# 重要: Secret 名は必ず GEMINI_API_KEY にすること（src/llm/gemini.ts が参照する名前と一致させる）。
npx wrangler secret put GEMINI_API_KEY --cwd worker

# 5) （QRペアリングを使う場合）サービスアカウント JSON を Secret 登録
#    ダウンロードした JSON ファイルの中身をそのまま貼り付ける。
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --cwd worker

# 6) デプロイ
npm --prefix worker run deploy
```

デプロイ完了後に表示される URL（例: `https://tasogare-diary-claude-proxy.<subdomain>.workers.dev`）を、クライアントの `.env` の `EXPO_PUBLIC_CLAUDE_WORKER_URL` に設定する。

## モデルの環境変数（差し替え可能）

用途別モデルは `wrangler.jsonc` の `vars`（`wrangler secret put` ではなく通常の変数）で上書きできる（[environments.md](../.claude/rules/environments.md) / api-contract.md 1.3）。

| 変数 | 既定 | 用途 |
|---|---|---|
| `GEMINI_MODEL_INTERACTIVE` | `gemini-3.1-flash-lite` | 連想語提案 / 調整 / 対話（低遅延・低コスト優先） |
| `GEMINI_MODEL_GENERATE` | `gemini-3.5-flash` | 日記文生成（品質優先） |

## ローカル開発

```bash
npm --prefix worker run dev
```

`.dev.vars`（gitignore 済み）に `GEMINI_API_KEY=...` を書けばローカル実行時にも読み込める（[wrangler のドキュメント](https://developers.cloudflare.com/workers/configuration/secrets/#local-development-with-secrets)参照）。

## テスト・型チェック

worker は独立した npm プロジェクトのため、ルートとは別にコマンドを実行する（ルート [build-commands.md](../.claude/rules/build-commands.md) 参照）。

```bash
npm --prefix worker run typecheck   # tsc --noEmit
npm --prefix worker test            # vitest run（ユニットテスト）
```

ユニットテスト（[vitest](https://vitest.dev/)）は `fetch`・`jose` をモックし、外部通信なしで純ロジックを検証する:
- `src/llm/__tests__/gemini.test.ts` — Gemini 実装（モデル解決・ロール写像・構造化出力・エラー写像・タイムアウト）
- `src/llm/__tests__/provider.test.ts` — プロバイダセレクタ（既定 gemini・未対応時エラー）
- `src/__tests__/auth.test.ts` — Firebase ID トークン検証（ヘッダ/クレーム検証の分岐）

## クライアント側の切替

クライアントは `isClaudeWorkerConfigured`（`src/services/claudeWorker/config.ts`、`EXPO_PUBLIC_CLAUDE_WORKER_URL` の有無で判定）で自動切替する。

- 未設定 → モック（`src/services/diaryApi.mock.ts`、ローカル完結）
- 設定済 → 本 Worker を HTTP 経由で呼ぶ（`src/services/diaryApi.functions.ts` → `src/services/claudeWorker/client.ts`）

> クライアント側のディレクトリ・関数名は `claudeWorker` のままとしている（機能名としての「AI連携」を指し、裏側の LLM プロバイダとは独立させているため）。

## プライバシー・ログ方針

- AI へは最小限のみ送信。日記本文・送受信ペイロードは**ログに残さない**（メタ情報のみ）。
- モデル/プロンプト版は `promptVersion` として返却（本文とは別に追跡）。

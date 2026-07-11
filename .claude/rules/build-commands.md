# build-commands.md — ビルド/テスト/lint コマンド & チェックループ手順

> Expo プロジェクト（Expo SDK 57 / RN 0.86 / React 19 / TypeScript）はステップ4で scaffold 済み。以下のコマンドは `package.json` の scripts と一致する（`lint`/`typecheck`/`test`/`format`）。

## ビルド / 実行

| 目的 | コマンド |
|---|---|
| 依存インストール | `npm install` |
| 開発サーバ起動（Expo） | `npx expo start` |
| iOS 実機/シミュレータ | `npx expo start --ios` |
| Android | `npx expo start --android` |
| Web プレビュー | `npx expo start --web` |
| プロダクションビルド | `eas build --platform <ios\|android>` |

## Lint / フォーマット / 型

| 目的 | コマンド |
|---|---|
| ESLint | `npm run lint` （= `eslint .`） |
| ESLint 自動修正 | `npm run lint:fix` （= `eslint . --fix`） |
| Prettier | `npm run format` （= `prettier --write .`） |
| 型チェック | `npm run typecheck` （= `tsc --noEmit`） |

## テスト

| 目的 | コマンド |
|---|---|
| 全ユニットテスト | `npm test` （= `jest`） |
| 関連テストのみ | `npx jest --findRelatedTests <file>` |
| ウォッチ | `npx jest --watch` |

## worker（Cloudflare Workers・別プロジェクト）

`worker/` は独立した npm プロジェクト（別 `package.json`／`tsconfig.json`）。ルートの lint/型/テスト対象外（`eslint.config.js`・`tsconfig.json` で除外）なので、変更時は個別にコマンドを実行する。

| 目的 | コマンド |
|---|---|
| 型チェック | `npm --prefix worker run typecheck` （= `tsc --noEmit`） |
| ユニットテスト | `npm --prefix worker test` （= `vitest run`） |
| ローカル実行 | `npm --prefix worker run dev` （= `wrangler dev`） |
| デプロイ | `npm --prefix worker run deploy` （= `wrangler deploy`） |

## hooks による自動実行

`.claude/settings.json` の PostToolUse hook が、ファイル編集後に `.claude/hooks/post-edit-check.sh` を実行する。内容:

- ESLint / Prettier（対象ファイル）
- 型チェック（`tsc --noEmit`）
- 関連ユニットテスト（`jest --findRelatedTests`）

`package.json` や各ツールが未整備の間は **グレースフルに no-op** する（空リポでも失敗しない）。lint・テストが失敗した場合、ClaudeCode は先に進まず修正すること。

---

## 実装後チェックループ（必須フロー）

> **ルール: 実装の指示を行った後は、必ず以下のループを実行し、指摘事項が0件になるまで繰り返すこと。** `/check-loop` スラッシュコマンドで呼び出せる。

1. メインエージェントがタスクを実装する
2. **チェック専用のサブエージェント**を起動し、以下を確認させる:
   - 修正漏れ・要件との齟齬
   - 不具合（バグ、例外処理漏れ、型不整合など）
   - コードの冗長な部分（重複ロジック、不要な再レンダリング、デッドコードなど）
   - `docs/` の設計書・Notion 要件との整合性
   - ブランチ・マージ操作が `develop` 向けになっているか（[git-workflow.md](git-workflow.md)）
3. 指摘が **1件以上** → 修正 → 手順2に戻る（再チェック）
4. 指摘が **0件** → ループ終了、完了として報告
5. 回答・報告は **日本語** で行う

### サブエージェント起動の目安
- チェック（既存/作成済みファイルへの実行）は **`reviewer` エージェント（`.claude/agents/reviewer.md`、Sonnet 5 固定）** を `Agent` で起動する（CLAUDE.md 原則7）
- チェック結果は「指摘リスト（該当ファイル:行・種別・修正案）」の形で受け取る

## 使用モデルの自動化（CLAUDE.md 原則7）
- **UserPromptSubmit フック** `.claude/hooks/model-advisor.sh` が依頼文を判定し、推奨モデル（新規作成→Opus 4.8／既存への修整・調査→Sonnet 5）を助言として注入する。**フックはモデルを切り替えられない**ため、必要に応じ `/model` で切り替える。
- **警告時は実行を停止**: 現在のモデルが **Opus 4.8 のまま新規作成以外の指示**を受けた場合は警告を注入する。警告時はメインエージェントはその指示の実行に着手せず、ユーザーに不一致を伝えて `/model` での Sonnet 5 切替を求め停止する。ユーザーが切替後に指示を再送するか、Opus 続行を明示的に指示した場合のみ実行する。
  - 現在モデルの検知: フック入力の `model` → 無ければ `transcript_path` 末尾の assistant 発話の `message.model`。
  - **検知できない場合は警告を出さず**（＝停止せず）、依頼内容ベースの推奨のみ表示する（安全側）。
- **レビュー・整合チェック・残タスク調査**は、メインエージェントが `reviewer` サブエージェント（`model: sonnet` 固定）を起動することで Sonnet 5 実行になる（フックが自動で起動するわけではない）。`/check-loop` の手順に従って明示的に起動する。

## セッション消費量の節約（チェックポイント方式）

> 背景: セッション利用枠（Anthropic 側の API 利用制限。会話のコンテキスト量とは別物）は ClaudeCode が実行中にリアルタイムで正確な割合として取得できない。そのため「消費量が90%に達したら」のような数値ベースの条件は実行不能（推測になる）。代わりに、**メインエージェントが確実に検知できるタスク境界（チェックポイント）** をトリガーにする。

**ルール**: 以下のいずれかのチェックポイントに到達するたびに、作業を止めて次を行う。

1. **1機能（1PR）の実装・チェックループ・コミット・PR作成が完了した直後**
2. ユーザーから次の指示を受ける前で、かつ会話が長くなってきたと判断した時（目安: 実装対象のサブタスクが3件以上完了、または大きめのサブエージェント呼び出しを複数回行った後）

チェックポイントでは:

1. **残タスクを `TaskCreate`/`TaskUpdate` で構造化して保持する**（会話履歴だけに残さない）。これにより、セッション制限等で中断しても、会話全体を読み返さずタスクリストを見れば再開できる。
2. **[Memory.md](../../Memory.md) を更新する**（「最終更新」日付・完了済み作業・残タスクの節を中心に。プロジェクト構成や技術情報に変更があれば該当節も更新）。`TaskCreate`/`TaskUpdate` がセッション内の再開用、Memory.md はセッションをまたいだ引き継ぎ用（次回セッション冒頭でも状況を把握できるようにする）。
3. 完了した内容・残タスクを簡潔に要約してユーザーに提示する。
4. 次の指示に進む前に、**`/compact` の実行をユーザーに提案する**（強制はしない。ユーザーが継続を望む場合はそのまま続ける）。

**長時間サブエージェント呼び出しの分割**: reviewer 等の大きな検証タスクは、可能な範囲でファイル単位・機能単位に分割して呼び出す。1回の巨大な呼び出し中にセッション制限へ到達すると、それまでの検証結果が失われやすいため（実例: QRペアリング実装時、再チェック用 reviewer がセッション上限で中断し、当該呼び出し分の結果を取りこぼした）。

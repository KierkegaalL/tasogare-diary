# build-commands.md — ビルド/テスト/lint コマンド & チェックループ手順

> React Native プロジェクト実体はステップ4で作成する。以下は想定コマンドであり、`package.json` 整備後に確定・更新すること。

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
- `Agent`（general-purpose もしくは `Explore` で読み取り調査）を使い、上記チェック観点を明示的に指示する
- チェック結果は「指摘リスト（該当ファイル:行・種別・修正案）」の形で受け取る

# git-workflow.md — ブランチ戦略・タスク管理・マージルール

## マージルール（最重要）

- **マージ作業を行う際は、必ず `develop` ブランチへマージすること。**
- 作業ブランチ（`feature/xxx`、`fix/xxx` 等）は **`develop` から分岐** する。
- 作業完了後のマージ先は **常に `develop`**。**`main` へは直接マージしない。**
- ClaudeCode が git 操作（`git merge` や PR 作成）を行う際は、**マージ先ブランチが `develop` になっていることを毎回確認してから実行** すること。
- 誤って `main` 等へのマージ操作を指示された場合も、**`develop` へのマージに置き換えて実行** すること。

## ブランチ構成

| ブランチ | 役割 |
|---|---|
| `main` | リリース済み安定版。直接マージ禁止。 |
| `develop` | 統合ブランチ。**全作業ブランチのマージ先。** |
| `feature/<name>` | 新機能。`develop` から分岐 → `develop` へマージ。 |
| `fix/<name>` | バグ修正。`develop` から分岐 → `develop` へマージ。 |
| `chore/<name>` | 雑務（設定・ドキュメント等）。`develop` から分岐 → `develop` へマージ。 |

## 標準フロー

```bash
git switch develop
git pull
git switch -c feature/diary-step-flow   # develop から分岐

# ...実装 + 実装後チェックループ（build-commands.md）...

git push -u origin feature/diary-step-flow
gh pr create --base develop --head feature/diary-step-flow   # base は必ず develop
```

> PR 作成時は `--base develop` を必ず指定。base が `main` になっていないか毎回確認する。

> マージ済みの作業ブランチは、ローカルの `git branch -d <branch>` で削除する（develop へのマージ確認後）。放置するとローカルブランチが際限なく増えるため、区切りのよいタイミング（チェックポイント等）で `git branch --merged develop` を確認しまとめて削除するとよい。

## コミットメッセージ

- 命令形の要約 + 必要に応じて本文。プレフィックス例: `feat:` / `fix:` / `chore:` / `docs:` / `test:`
- 関連 Phase / 機能が分かる粒度で分割する。

## タスク管理・ラベル体系

| ラベル | 用途 |
|---|---|
| `phase-1`〜`phase-4` | features.md の Phase 定義に対応 |
| `feature` | 新機能 |
| `bug` | 不具合 |
| `chore` | 設定・ドキュメント |
| `claude-api` | Claude API 連携関連 |
| `firebase` | Auth / Firestore / Functions 関連 |
| `ui` | 画面・オーブ演出関連 |
| `blocked` | 依存待ち |

- タスクは Phase 単位で起票し、対応する作業ブランチを `develop` から切って進める。

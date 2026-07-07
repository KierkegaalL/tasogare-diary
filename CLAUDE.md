# CLAUDE.md — たそがれ日記

> このファイルは ClaudeCode 向けルールの **入口** です。詳細ルールは `.claude/rules/` に分離しています。実装・調査・git 操作の前に、必ず該当する rules ファイルを参照してください。

## プロジェクト概要

**たそがれ日記** は、1日の終わり（たそがれ時）に心を整えるための日記アプリです。

- **技術スタック**: React Native / Expo（クライアント）、Firebase（Auth / Firestore / Functions）、Claude API 連携
- **中心機能**: **4ステップ日記フロー**（下記）を軸に、Claude API による連想語提案・日記文生成・寄り添い対話、QRペアリング、「こころの灯」オーブ表現を提供する
- **4ステップ日記フロー（きもち→できごと→ことば→たしかめる→灯）**:
  1. **きもち**: いまの気持ちを一言／候補チップで選ぶ
  2. **できごと**: きょうのできごとを一言／候補チップで選ぶ
  3. **ことば**: Claude API が連想語を提案し、選択・追加する
  4. **たしかめる**: Claude API が日記文を生成→調整→保存する
  5. **灯**: 保存後に「こころの灯」が灯る演出（専用入力画面は持たず、進捗ドットは4つ）

## ディレクトリ構成

```
tasogare-diary/
├── CLAUDE.md              # 本ファイル（ルールの入口）
├── README.md
├── docs/                  # 詳細設計（ステップ3で整備）
│   ├── api-contract.md    # API仕様（Claude API / Firebase Functions）
│   ├── architecture.md    # システム構成・画面遷移・UI・オーブ仕様
│   └── data.md            # Firestore コレクション設計・データ関係図
├── .claude/
│   ├── settings.json      # hooks（lint/型/テスト自動実行）
│   ├── rules/             # 詳細ルール（下記参照）
│   ├── skills/            # 実装時の定型知識（RN/Expo・Firebase）
│   ├── commands/          # スラッシュコマンド（チェックループ等）
│   └── hooks/             # hook 実行スクリプト
└── src/                   # アプリ実装（ステップ4で作成）
```

## 実装時に必ず守るべき原則

1. **実装後チェックループは必須**
   実装の指示を受けて作業した後は、必ずチェック専用のサブエージェントを起動し、指摘が0件になるまで「修正→再チェック」を繰り返すこと。手順は [.claude/rules/build-commands.md](.claude/rules/build-commands.md) に明文化。`/check-loop` コマンドで呼び出せる。

2. **詳細設計は `docs/` 配下の3ファイルを正とする**
   実装は必ず [docs/api-contract.md](docs/api-contract.md) / [docs/architecture.md](docs/architecture.md) / [docs/data.md](docs/data.md) を参照し、変更が生じたら設計書側も更新すること。

3. **要件は Notion を正とする**
   要件の追加・変更は必ず Notion を先に更新し、その後リポジトリ側のルールファイルへ反映すること。Notion ページへのリンクは [.claude/rules/features.md](.claude/rules/features.md) に記載。

4. **マージは必ず `develop` ブランチへ**
   作業ブランチは `develop` から分岐し、マージ先は常に `develop`。`main` へ直接マージしない。詳細は [.claude/rules/git-workflow.md](.claude/rules/git-workflow.md)。誤って `main` 等へのマージを指示された場合も `develop` へ置き換えて実行すること。

5. **やりとりは日本語で行う**
   本プロジェクトでの回答・質問・報告は日本語で行うこと。

6. **スコープはたそがれ日記に限定**
   本リポジトリでの会話・作業は「たそがれ日記」アプリに関するものに限定する。

7. **使用モデルの使い分け**
   タスクの性質に応じて使用モデルを切り替えること。
   - **新規作成**（新しいファイル・機能・ドキュメントをゼロから作成する）: **Opus 4.8**（`claude-opus-4-8`）を使用する。
   - **既存・作成済みファイルへの実行**（修整対応、バグ修正、残タスク調査、リファクタ、レビュー等）: **Sonnet 5**（`claude-sonnet-5`）を使用する。
   - **自動化（補助）**: `UserPromptSubmit` フック（`.claude/hooks/model-advisor.sh`）が依頼文を判定して推奨モデルを**助言**する（フックはモデルを切り替えられない。必要に応じ `/model` で切替）。レビュー・整合チェック・残タスク調査は、メインエージェントが `reviewer` サブエージェント（`.claude/agents/reviewer.md`、`model: sonnet` 固定）を起動することで Sonnet 5 実行になる（フックが自動起動するわけではない）。

## `.claude/rules/` 参照一覧

| ファイル | 内容 |
|---|---|
| [features.md](.claude/rules/features.md) | 機能一覧・Phase定義（4ステップ日記フロー、Claude API連携、QRペアリング、「こころの灯」オーブ）、Notion要件リンク |
| [build-commands.md](.claude/rules/build-commands.md) | ビルド・テスト・lint コマンド一覧、サブエージェントチェックループの実行手順 |
| [environments.md](.claude/rules/environments.md) | 環境定義（dev/staging/prod）、デバイス要件、API ベースURL |
| [git-workflow.md](.claude/rules/git-workflow.md) | ブランチ戦略・タスク管理・ラベル体系、**develop マージルール** |
| [constraints.md](.claude/rules/constraints.md) | 制約事項・非機能要件（パフォーマンス、オフライン対応、プライバシー・データ保持） |

## 現在のフェーズ

**ステップ1：ハーネス整備**（本コミットで整備）。完了条件は CLAUDE.md / hooks / skills 雛形 / rules 5ファイル / チェックループ手順の明文化。以降のステップ2（Notion要件定義）はハーネス完了後に着手する。

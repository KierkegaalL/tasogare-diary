---
name: firebase
description: たそがれ日記の Firebase（Auth / Firestore / Functions）に関する定型知識。認証、日記データの保存・取得、QRペアリング、Claude API を呼ぶ Functions を扱うとき参照する。
---

# Firebase 定型知識（雛形）

> ステップ1時点の雛形。実装フェーズ（ステップ4）で肉付けする。コレクション設計の正は [data.md](../../../docs/data.md)、API 仕様は [api-contract.md](../../../docs/api-contract.md)、環境は [environments.md](../../rules/environments.md)。

## 構成方針

- **Auth**: ユーザー認証。日記は本人（uid）のみアクセス可能。
- **Firestore**: 日記データ・ペアリング情報を保存。オフライン永続化を有効化（[constraints.md](../../rules/constraints.md)）。
- **Functions**: Claude API 呼び出しを **サーバ側で仲介**（API キーをクライアントに置かない）。

## エミュレータ（ローカル開発）

```bash
firebase emulators:start   # Auth / Firestore / Functions をローカル起動
```

## セキュリティルール方針

- 日記・ペアリング情報は `uid` スコープで本人のみ read/write（最小権限）。
- ルールは実装時に `firestore.rules` に定義し、エミュレータでテストする。

## 実装メモ（ステップ4で追記）

- SDK: Expo では `@react-native-firebase/*`（Development Build）か Web SDK かを実装開始時に決定
- 環境切替: dev/staging/prod で設定を読み分け（[environments.md](../../rules/environments.md)）
- Claude API 連携 Functions のリクエスト/レスポンス仕様は [api-contract.md](../../../docs/api-contract.md)
- TODO: 実プロジェクト作成後、コレクション名・Functions エンドポイントを確定

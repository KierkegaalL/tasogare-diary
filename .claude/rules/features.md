# features.md — 機能一覧・Phase定義

> 要件の **正（source of truth）は Notion**。本ファイルは Notion 要件の要約とリンクを保持する。要件変更時は Notion を先に更新し、その後本ファイルへ反映すること。

## Notion 要件ページ（要リンク）

要件の正は下記 Notion「たそがれ日記 要件定義書」。4ステップ日記フロー／Claude API 統合／Firebase・QRペアリングの要件を1ページに統合している。要件変更時は必ず Notion を先に更新し、本ファイルへ反映する。

| ページ | URL |
|---|---|
| たそがれ日記 要件定義書（統合） | https://app.notion.com/p/395cd5c5312e81b0b73fc2d95219b084 |

## 中心機能

### 1. 4ステップ日記フロー（きもち→できごと→ことば→たしかめる→灯）
入力は4ステップ、最後に「灯」の演出で締める。進捗ドットは4つ（`visual-design.html` 準拠）。
1. **きもち**: いまの気持ちを一言入力／候補チップから選択
2. **できごと**: きょうのできごとを一言入力／候補チップから選択
3. **ことば**: きもち・できごと＋過去傾向から Claude API が連想語を提案、選択・自由追加
4. **たしかめる**: 選択語から Claude API が日記文を生成→プレビュー・調整→保存
5. **灯（保存後の演出）**: 保存完了で「こころの灯」が灯り、ホームのオーブへ反映（専用入力画面は持たない）

### 2. Claude API 連携
- ユーザーの記述と感情を入力に、共感的な応答・やさしい問いかけを生成
- プロンプト設計方針・レスポンス活用方法の詳細は Notion + [docs/api-contract.md](../../docs/api-contract.md)

### 3. QRペアリング
- 端末間・ユーザー間のペアリングを QR コードで行う
- ペアリング情報の Firestore 設計は [docs/data.md](../../docs/data.md)

### 4. 「こころの灯」オーブ
- 日記の積み重ねを、光るオーブのアニメーションとして視覚化
- アニメーション仕様は [docs/architecture.md](../../docs/architecture.md)

## Phase 定義

| Phase | 内容 | 対応ステップ |
|---|---|---|
| Phase 0 | ハーネス整備（本リポジトリ scaffolding） | ステップ1 |
| Phase 1 | 4ステップ日記フロー（ローカル完結・Claude API 応答） | ステップ4 |
| Phase 2 | Firebase 連携（Auth / Firestore 永続化） | ステップ4 |
| Phase 3 | QRペアリング | ステップ4 |
| Phase 4 | 「こころの灯」オーブ表現・演出磨き込み・Web ダッシュボード | ステップ4 |

> **Phase 0〜4はすべて完了済み**（[CLAUDE.md](../../CLAUDE.md)「現在のフェーズ」節）。上表は粗い区分のため、Phase内の主要サブフェーズも参考として記載する。

### Phase 4 のサブフェーズ（Web ダッシュボード・QRペアリング等の実装単位）
週次/月次/過去3ヶ月インサイト、日記一覧（Web）、Apple/Googleリンク昇格、ネイティブ資格情報取得等を段階的に実装。詳細な実装経緯は [Memory.md](../../Memory.md) を参照。

### ネイティブFirebase移行（Phase0〜4完了後・別軸のPhase番号、完了済み）
Firebase Auth/Firestore を JS SDK からネイティブSDK（`@react-native-firebase`）へ移行する取り組みを、上表とは独立した Phase1〜7 として管理した（**混同注意**：本節の Phase0〜4とは別のナンバリング体系）。設計・手順の正は [docs/migration-react-native-firebase.md](../../docs/migration-react-native-firebase.md)。全フェーズ完了・実機検証済み。

> 各機能の受け入れ条件・詳細仕様は Notion を参照。実装時は Phase 単位で分割する。

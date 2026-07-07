# たそがれ日記 詳細設計：アーキテクチャ（architecture.md）

> **位置づけ**: ステップ3（詳細設計）の中核。[docs/design/basic-design.md](design/basic-design.md) の全体方針を受けて、システム構成・ディレクトリ・ナビゲーション・状態管理・画面遷移・UIデザインシステム・「こころの灯」オーブのアニメーション仕様を確定水準で定義する。データ設計は [data.md](data.md)、API 仕様は [api-contract.md](api-contract.md)、画面別仕様は [screen.md](screen.md) に分離する（これら3ファイルはステップ3の後続タスクで作成する）。
> **一次情報**: UI（配色・タイポグラフィ・クラス名・画面遷移）は `visual-design.html` v1 を正とする。要件の正は Notion [たそがれ日記 要件定義書](https://app.notion.com/p/395cd5c5312e81b0b73fc2d95219b084)。
> **技術選定**: 要件に明記が無いものは「案A/案B＋推奨」で提示し断定しない（本プロジェクトの方針。[basic-design.md](design/basic-design.md) の一次情報の扱いに準拠）。

---

## 1. システム構成

### 1.1 全体構成
```mermaid
graph TD
  subgraph Mobile["モバイル (React Native / Expo)"]
    UI["画面層（screens/components）"]
    STORE["状態層（stores）"]
    SVC["サービス層（api/firebase/claude ラッパ）"]
    LOCAL["ローカル永続（下書き）"]
  end
  subgraph Web["Web ダッシュボード（振り返り専用）"]
    WUI["ダッシュボード/デバイス連携"]
  end
  subgraph FB["Firebase"]
    AUTH["Auth"]
    FS["Firestore（オフライン永続化）"]
    FN["Cloud Functions"]
  end
  CL["Claude API（api.anthropic.com）"]

  UI --> STORE --> SVC
  SVC --> AUTH
  SVC --> FS
  SVC --> FN
  STORE --> LOCAL
  WUI --> AUTH
  WUI --> FS
  WUI --> FN
  FN -->|サーバ側のみ| CL
  FN --> FS
```

### 1.2 レイヤ責務（モバイル）
| レイヤ | 責務 | 主なもの |
|---|---|---|
| 画面層 | 表示・入力・遷移 | `screens/`, `components/` |
| 状態層 | 画面横断の状態・下書き・楽観更新 | `stores/`（下書き、認証、設定、日記キャッシュ） |
| サービス層 | 外部I/Oの抽象化 | `services/firebase`, `services/functions`, `services/diary` |
| ローカル永続 | オフライン下書き | 下書きストア（後述） |

> **原則**: 画面層は Claude API / Firestore を直接触らず、必ずサービス層を経由する。Claude API は Functions 経由のみ（`constraints.md`）。

---

## 2. ディレクトリ構成（src/、案）

```
src/
├── app/                # ルート・ナビゲーション定義
│   ├── navigation/     # Stack / Tab の構成
│   └── providers/      # Auth/Theme/QueryClient 等のProvider
├── screens/            # 画面（1画面=1ディレクトリ）
│   ├── home/
│   ├── diary/          # mood / event / words / preview（4ステップ）
│   ├── calendar/
│   ├── detail/         # 詳細＋AI対話
│   ├── settings/
│   └── webConnect/     # QR表示
├── components/         # 再利用UI（Orb, Pebble, StepProgress, NoteCard 等）
├── stores/             # 状態（draft, auth, settings, entries）
├── services/           # firebase / functions / diary / pairing
├── theme/              # デザイントークン（配色・タイポ・spacing）
├── hooks/              # 汎用フック
├── types/              # 型定義
└── utils/              # 汎用ユーティリティ
```

> Web ダッシュボードは別ディレクトリ／別アプリで管理する（第6章の実装方式に依存）。共有したい型・デザイントークンは切り出し方を第6章で決める。

---

## 3. ナビゲーション構成

### 3.1 構成（案・推奨）
- **ライブラリ（推奨）**: React Navigation（`native-stack` ＋ `bottom-tabs`）。RN/Expo で最も実績があり、型付きルートに対応。
  - 案B: Expo Router（ファイルベース）。将来 Web 共有を強めるなら選択肢。導入コストと引き換えに規約が固い。
- **構成**:
  - **Bottom Tabs**: ホーム / カレンダー（`visual-design.html` の `.tab-bar` に対応）。
  - **Stack（各タブ上）**: 詳細（detail）、設定（settings）→ Webで見る（webConnect）。
  - **日記作成フロー**: ホームから push する **モーダル/独立スタック**（mood → event → words → preview）。フロー中は Tab を隠す。

### 3.2 ルート定義（概念）
```
RootStack
├─ MainTabs
│   ├─ HomeStack ( Home → Detail )
│   └─ CalendarStack ( Calendar → Detail )
├─ DiaryFlow (modal) : Mood → Event → Words → Preview → (灯 演出)
└─ SettingsStack : Settings → WebConnect
```

> **画面ID対応**（`visual-design.html` の実装ID）: `Mood`=`mood1`（きもち）／`Event`=`event1`（できごと）／`Words`=`combine1`（ことば）／`Preview`=`create2`（たしかめる）。`src/screens/diary/{mood,event,words,preview}` はこの対応に従う。

### 3.3 画面遷移フロー（全体）
```mermaid
stateDiagram-v2
  [*] --> Home
  Home --> DiaryFlow: hero「日記を書く」
  Home --> Calendar: tab
  Home --> Settings: ⚙
  Calendar --> Detail: エントリ選択
  Home --> Detail: 最近の日記
  Settings --> WebConnect: 「Webで見る」

  state DiaryFlow {
    [*] --> Mood
    Mood --> Event: 次へ / スキップ
    Event --> Words: 次へ / スキップ
    Words --> Preview: 「文章にする」
    Preview --> Words: ↻ 選び直す
    Preview --> Saved: 「保存する」
    Saved --> Lit: 点灯演出
    Lit --> [*]: オーブ反映→復帰
    Event --> Mood: 戻る
    Words --> Event: 戻る
    Preview --> Words: 戻る
  }
  Mood --> Home: 戻る（最初のステップ）
  DiaryFlow --> Home: 保存完了（灯）
  DiaryFlow --> Detail: 保存したエントリを開く
```

> **basic-design.md との対応**: 保存フローは `Preview → Saved →（点灯演出）Lit → Home/Detail` で [basic-design.md](design/basic-design.md) 第3.2節と一致させる（`Saved` は保存確定、`Lit` は保存後の点灯演出で専用入力画面を持たない）。
> **戻る操作**: 各ステップは1つ前へ戻れる（`.back-btn`）。最初のステップ（Mood）からの戻るはフローを離脱し Home へ。フロー離脱時は下書きを保持（第7章）。

---

## 4. 状態管理方針

### 4.1 方針（決定）
> **決定（2026-07-07）**: 下表の推奨（**Zustand ＋ TanStack Query**、下書きは MMKV 永続）を採用。

| 対象 | 採用 | 理由 |
|---|---|---|
| クライアント状態（下書き・UI） | **Zustand** | 軽量・ボイラープレート少・companion 体験の軽さに合致。案B: Redux Toolkit（規模拡大時の規律）／案C: Context+useReducer（最小だが横断状態に弱い） |
| サーバ状態（日記一覧・詳細） | **TanStack Query**（＋Firestore購読） | キャッシュ・再取得・楽観更新を標準化。オフライン時は Firestore 永続化に委譲 |

### 4.2 主なストア（Zustand 想定）
| ストア | 保持 | 備考 |
|---|---|---|
| `draftStore` | 進行中の日記（mood/event/words/生成文/感情ラベル） | オフライン継続の要。ローカル永続に同期 |
| `authStore` | 認証状態・uid | 差し替え可能な認証プロバイダ（下記）を利用 |
| `settingsStore` | 表示設定・reduced-motion 等 | アクセシビリティ反映 |
| `entriesCache` | 直近エントリ | TanStack Query と併用 |

**認証プロバイダの抽象（Phase2 Auth）**: 認証は `AuthProvider` インターフェース（`init`/`signIn`/`signOut`）で抽象化し、実装を差し替える。
- **ローカル匿名プロバイダ（既定）**: 端末に uid を発行・永続（AsyncStorage）。モバイルはログイン画面を持たず、uid を自動確立する（visual-design.html のとおり、サインインは「Webで見る」/バックアップ時のみ）。
- **Firebase プロバイダ**: `EXPO_PUBLIC_FIREBASE_*` 設定を検出したら切り替える。配布しない前提のため既定は **匿名認証（Firebase Auth Anonymous、JS SDK）** ＝ 開発ビルド不要・Expo Go 可で実 uid を確立する。uid は Firestore（entries/messages）のスコープに用いる。設定プロバイダ失敗時（例: 初回起動オフライン）は authStore がローカル匿名へフォールバックする。Apple/Google サインインは恒久アカウントが要る段階（Webで見る/バックアップ）で匿名アカウントへ **リンク昇格** する。

### 4.3 下書き（オフライン）永続
- **推奨**: `react-native-mmkv`（同期・高速）に `draftStore` を永続化。案B: `AsyncStorage`（標準・非同期）。
- 確定エントリは Firestore に保存し、オフライン永続化で復帰時同期（[constraints.md](../.claude/rules/constraints.md)）。

---

## 5. UIデザインシステム（`visual-design.html` を正）

### 5.1 カラートークン（CSS変数 → theme）
| 用途 | トークン | 値 |
|---|---|---|
| 背景（紙） | `paper` / `paperSoft` | `#F1EFEE` / `#FBFAF8` |
| 文字（墨） | `ink` / `inkSoft` / `inkFaint` | `#302E3A` / `#726F7C` / `#ACA9B2` |
| たそがれ（主アクセント） | `dusk` / `duskDeep` / `duskSoft` | `#8C6F8C` / `#6F5670` / `#EFE7EE` |
| 感情：穏やか | `calm` / `calmSoft` | `#7FA48F` / `#E6EDE8` |
| 感情：やや疲れ | `tender` / `tenderSoft` | `#C0975A` / `#F2E9D8` |
| 感情：しんどい | `heavy` / `heavySoft` | `#B27E7E` / `#F1E2E1` |
| 境界線 | `line` | `#E5E1DD` |

> 感情3色はオーブ・カレンダー・バッジで共通。`theme/colors.ts` に集約し、ハードコード禁止。

### 5.2 タイポグラフィ
| 役割 | フォント |
|---|---|
| 見出し・日記本文 | `Klee One`（fallback: Hiragino Mincho ProN, serif） |
| UI | `Zen Maru Gothic`（fallback: Hiragino Sans, sans-serif） |

- Expo では `expo-font` / `expo-google-fonts` で読み込む。日記本文は必ず display フォントを用いる（`visual-design.html` の `.diary-full-text` / `.note-card`）。

### 5.3 主要コンポーネント（クラス→RN）
| コンポーネント | 由来クラス | 用途 |
|---|---|---|
| `Orb` | `.orb` | 呼吸するオーブ（第8章） |
| `OrbMini` | `.orb-mini` | 一覧・カレンダー・バッジの小オーブ |
| `Pebble` | `.pebble`（-a/-b/-c 形） | 候補・選択チップ。`-a/-b/-c` は有機的な角丸の3バリエーションで、`visual-design.html` では順に交互配置。選択時は `.pebble.on` 相当のスタイル |
| `StepProgress` | `.step-progress` / `.step-dot` | 4ステップ進捗ドット |
| `NoteCard` | `.note-card` / `.note-tape` | 生成文プレビュー |
| `PrimaryButton` | `.primary-btn` | 主アクション |
| `MoodBadge` | `.mood-badge` | 感情ラベル表示 |

---

## 6. Web ダッシュボード実装方式（案）

分析UIはモバイルに載せず Web 限定（`visual-design.html` `.dash-note`）。

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **案A（推奨）** | **Next.js（React）別アプリ ＋ Firebase Hosting** | Web 特化UIを最適化、SSR/ルーティング成熟、同一 Firebase を参照 | コードベースが分離、型・トークンの共有に工夫要 |
| 案B | Expo Web で単一コードベース | RN コンポーネント共有 | ダッシュボードの表現力・レスポンシブに制約、バンドル肥大 |
| 案C | 軽量SPA（Vite+React）＋ Firebase Hosting | 軽い | エコシステム/規約が案A比で弱い |

- **共有戦略（案A採用時）**: `packages/shared`（型・デザイントークン・Firestore スキーマ型）を切り出し、モバイル/Web で参照（モノレポ or npm ワークスペース）。
- 認証はモバイルの QR ペアリング（api-contract.md 予定）＋ Apple/Google サインイン。

> **決定（2026-07-07、U-04）**: **案A（Next.js 別アプリ＋Firebase Hosting）を採用**。型・デザイントークンは `shared` パッケージで共有する。

---

## 7. オフライン・同期アーキテクチャ

```mermaid
sequenceDiagram
  participant U as ユーザー
  participant D as draftStore(+MMKV)
  participant Q as TanStack Query
  participant FS as Firestore(offline)
  U->>D: 4ステップ入力（オフライン可）
  U->>Q: 「保存する」
  Q->>FS: エントリ書込（楽観更新）
  Note over FS: オフライン時はローカルキューに保持
  FS-->>Q: オンライン復帰で自動同期
  Q-->>U: 一覧/詳細へ反映
```
- 入力途中はネット不要（`draftStore`）。Claude を要する処理（連想・生成・対話・まとめ）はネット必須で、オフライン時は明示（`constraints.md`）。

---

## 8. 「こころの灯」オーブ アニメーション仕様

### 8.1 呼吸（常時サイン）
`visual-design.html` の `@keyframes breathe` を正とする。

| 項目 | 値（正） |
|---|---|
| 変化 | `scale` 1.0 ↔ 1.055（中間 50%）|
| 周期 | 4.8s、`ease-in-out`、無限ループ |
| 塗り | `radial-gradient(circle at 32% 28%, #ffffffaa 0%, var(--calm) 0%, var(--tender) 55%, var(--dusk) 100%)`（ホーム大オーブ、`visual-design.html:89` 原文）|
| 実装 | `react-native-reanimated`（UIスレッド駆動、JS をブロックしない）|

> グラデーションの `calm`/`tender`/`dusk` は RN では `theme.colors` の同名トークンで参照する。原文では `#ffffffaa 0%` と `var(--calm) 0%` が同じ 0% 位置に置かれており（＝最初の白は実質ハイライトの起点）、実装時にグラデーションの意図を確認しつつ再現する。

- **感情別の小オーブ**: `radial-gradient(circle at 35% 30%, #fff8, <感情色>)`。感情色は calm/tender/heavy を適用。
- **reduced-motion**: `prefers-reduced-motion: reduce` 相当で呼吸を停止（`AccessibilityInfo.isReduceMotionEnabled`）。`visual-design.html` の `@media (prefers-reduced-motion:reduce){.orb{animation:none;}}` に対応。

### 8.2 灯る演出（保存後）
要件定義書 §4.1 の「灯（保存後の演出）」を可視化する。**新規仕様**（HTML にモック無し、詳細はここで定義）。

- **トリガ**: 「保存する」成功後。
- **表現（推奨）**: ホームの大オーブへ遷移しつつ、(1) 一瞬明度が上がる（グロー）→(2) 当日の感情色へ落ち着く→(3) 気づき一言を短くフェード表示。所要 ~1.2–1.6s、`ease-out`。
- **reduced-motion 時**: グローを省略し、感情色反映＋一言表示のみ（クロスフェード）。
- **配色**: グローは `duskSoft`〜白のハイライト、収束色は当日の感情色。
- 数値（イージング曲線・各フェーズ時間）は実装時に微調整可とし、`theme/motion.ts` に定数化。

### 8.3 その他アニメーション（`visual-design.html` 準拠）
| 要素 | 由来 | 挙動 |
|---|---|---|
| ビューファインダ（Web連携） | `@keyframes softPulse` | opacity 0.55↔1、2.6s |
| 読み取り待機ドット | `.pulse-dot` | softPulse 1.4s |
| 押下フィードバック | `.hero-zone:active` 等 | scale 0.96–0.97 |

いずれも reduced-motion で停止／簡略化する。

---

## 9. 要件・設計トレース
| 本章の項目 | 対応元 |
|---|---|
| システム構成・レイヤ | basic-design.md 第2章／Notion 要件定義書 §6 |
| 画面遷移（4ステップ→灯） | basic-design.md 第3章／Notion §4.1 |
| 状態管理・オフライン | basic-design.md 第4/7章／`constraints.md` |
| 配色・タイポ・コンポーネント | `visual-design.html`（CSS変数・クラス） |
| オーブ仕様 | `visual-design.html` `@keyframes breathe`／Notion §3・§4.1 |
| Web 実装方式 | basic-design.md 第2章／U-04 |

---

## 10. 次工程への申し送り・未確定
- **決定済（2026-07-07）**: Web 実装方式＝Next.js 別アプリ（第6章、U-04）、状態管理＝Zustand＋TanStack Query（第4章）、QR 認証＝短命回転トークン（U-08、api-contract.md 第5章）。詳細は Notion 要件定義書 §11。
- **data.md（作成済み）**: エントリ/ワード/感情/対話/ペアリング/インサイトの確定スキーマ、Firestore 構造とセキュリティルール、下書き↔同期の整合を反映済み。
- **screen.md（作成済み）**: 各画面のレイアウト・状態・遷移・空/エラー/ローディング表現、コンポーネント props を反映済み。
- **api-contract.md（作成済み）**: Claude 各用途の入出力、Functions エンドポイント、QR 発行/照合、モデル選定（U-12）を反映済み。
- **残作業**: オーブ 8.2 灯る演出の最終数値仕様は実機で調整（60fps 維持、実装フェーズで確定）。

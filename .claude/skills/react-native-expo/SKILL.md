---
name: react-native-expo
description: たそがれ日記の React Native / Expo に関する定型知識。ビルド・実行・デバッグ、画面遷移、アニメーション（こころの灯オーブ）を扱うとき参照する。
---

# React Native / Expo 定型知識（雛形）

> ステップ1時点の雛形。実装フェーズ（ステップ4）で肉付けする。コマンドの正は [build-commands.md](../../rules/build-commands.md)、環境は [environments.md](../../rules/environments.md)。

## ビルド・実行

```bash
npx expo start            # 開発サーバ
npx expo start --ios      # iOS シミュレータ
npx expo start --android  # Android エミュレータ
npx expo start -c         # キャッシュクリアして起動
eas build --platform ios  # プロダクションビルド（EAS）
```

## デバッグ

- 開発メニュー: 端末をシェイク / `Cmd+D`（iOS）/ `Cmd+M`（Android）
- ログ: `npx expo start` のターミナル、または `npx react-native log-ios` / `log-android`
- ネットワーク/状態のデバッグには React Native DevTools を使用

## 実装メモ（ステップ4で追記）

- ナビゲーション: 4ステップ日記フローの画面遷移方針は [architecture.md](../../../docs/architecture.md)
- アニメーション: 「こころの灯」オーブは `react-native-reanimated` を UI スレッドで駆動（[constraints.md](../../rules/constraints.md)）
- 状態管理: 方針は architecture.md を正とする
- TODO: プロジェクト雛形（`create-expo-app`）作成後、実際のディレクトリ/コマンドを確定

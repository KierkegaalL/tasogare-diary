import { registerRootComponent } from 'expo';

import App from './App';
import { bootstrapNativeCredentialSource } from './src/services/auth/nativeAuthBootstrap';

// 開発/配布ビルドでのみ、ネイティブ資格情報ソース（Apple/Google サインインUI）を差し込む。
// EXPO_PUBLIC_ENABLE_NATIVE_AUTH が真のときだけ有効化され、Expo Go 既定では何もしない
// （ネイティブモジュールを評価しないため起動が壊れない。canLinkAccount は false で導線非表示）。
// bootstrap はネイティブモジュールを静的 import しないので App.tsx を汚さずここで一度呼ぶ。
bootstrapNativeCredentialSource();

// registerRootComponent は AppRegistry.registerComponent('main', () => App) を呼ぶ。
// Expo Go / ネイティブビルドのどちらでも環境が適切に初期化される。
registerRootComponent(App);

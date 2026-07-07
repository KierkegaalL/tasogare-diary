import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent は AppRegistry.registerComponent('main', () => App) を呼ぶ。
// Expo Go / ネイティブビルドのどちらでも環境が適切に初期化される。
registerRootComponent(App);

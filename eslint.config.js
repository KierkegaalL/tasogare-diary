// Expo のフラット ESLint 設定（eslint-config-expo）をベースにする。
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    // worker/・web/ は独立プロジェクト（別 tsconfig・別依存）。ルート ESLint の対象外にする。
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'worker/*', 'web/*'],
  },
];

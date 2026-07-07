// Expo のフラット ESLint 設定（eslint-config-expo）をベースにする。
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*'],
  },
];

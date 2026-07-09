module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated 4.x（Orb/LitOverlay の呼吸・灯る演出）は worklets プラグインが必須。
    // プラグイン一覧の最後に配置すること（reanimated/worklets の要件）。
    plugins: ['react-native-worklets/plugin'],
  };
};

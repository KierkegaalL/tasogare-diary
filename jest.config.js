module.exports = {
  preset: 'jest-expo',
  // worker/・web/ は独立プロジェクト。ルート jest の対象外にする。
  testPathIgnorePatterns: ['/node_modules/', '/worker/', '/web/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@react-native-async-storage/.*|@tanstack/.*|zustand|react-native-reanimated|react-native-worklets|react-native-svg))',
  ],
};

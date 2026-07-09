module.exports = {
  preset: 'jest-expo',
  // worker/ は独立プロジェクト（vitest 使用）。ルート jest の対象外にする。
  testPathIgnorePatterns: ['/node_modules/', '/worker/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@react-native-async-storage/.*|@tanstack/.*|zustand|react-native-reanimated|react-native-worklets|react-native-svg))',
  ],
};

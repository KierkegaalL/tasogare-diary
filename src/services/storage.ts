import AsyncStorage from '@react-native-async-storage/async-storage';

// 下書き等のローカル永続の抽象。
// 実装は AsyncStorage（Expo Go 互換）を採用（architecture.md 第4.3節／data.md 第8章）。
// 開発ビルド移行時は本インターフェースを維持したまま MMKV アダプタへ差し替え可能。
// draftStore（zustand persist）から利用する（src/stores/draftStore.ts）。
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const storage: KeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

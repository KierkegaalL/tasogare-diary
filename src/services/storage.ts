import AsyncStorage from '@react-native-async-storage/async-storage';

// 下書き等のローカル永続の抽象。
// 確定方針（data.md 第8章）は下書き=MMKV だが、MMKV はネイティブモジュールのため
// Expo Go では動かない。開発ビルド未導入の初期スキャフォールドでは、確定方針から一時的に
// 逸脱して Expo Go 互換の AsyncStorage で実装する。開発ビルド移行時に本インターフェースを
// 維持したまま MMKV アダプタへ差し替える。
// TODO(実装): draftStore へ配線（現状は未配線。オフライン下書き永続を接続する）。
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

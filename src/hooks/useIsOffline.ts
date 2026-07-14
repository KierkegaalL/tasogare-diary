import { useNetInfo } from '@react-native-community/netinfo';

// 判定中（isConnected===null）も安全側でオフライン扱いにする（PreviewScreenでのreviewer指摘を
// 全画面へ横展開。=== false だと判定中はオンライン扱いになり、Claude必須処理を誤って許可しうる）。
export function useIsOffline(): boolean {
  const netInfo = useNetInfo();
  return netInfo.isConnected !== true;
}

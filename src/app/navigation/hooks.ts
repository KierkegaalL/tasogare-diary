import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { DiaryFlowParamList, RootStackParamList } from './types';

// 日記フロー画面（DiaryFlowNavigator 配下）のナビゲーション型。
// フロー内遷移（DiaryFlowParamList）と親ルート（RootStackParamList、保存後の MainTabs 等）の両方を扱う。
export type DiaryFlowNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<DiaryFlowParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export const useDiaryFlowNavigation = () => useNavigation<DiaryFlowNavigation>();

// ルートスタック直下（Home/Settings/Detail/WebConnect）のナビゲーション型。
export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

export const useRootNavigation = () => useNavigation<RootNavigation>();

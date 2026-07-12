import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';
import { MainTabs } from './MainTabs';
import { DiaryFlowNavigator } from './DiaryFlowNavigator';
import { DetailScreen } from '../../screens/detail/DetailScreen';
import { SettingsScreen } from '../../screens/settings/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

// ルートスタック（architecture.md 第3.2節）。日記フローはモーダル提示。
export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="DiaryFlow" component={DiaryFlowNavigator} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Detail" component={DetailScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

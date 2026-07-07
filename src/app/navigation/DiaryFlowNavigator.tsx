import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { DiaryFlowParamList } from './types';
import { MoodScreen } from '../../screens/diary/mood/MoodScreen';
import { EventScreen } from '../../screens/diary/event/EventScreen';
import { WordsScreen } from '../../screens/diary/words/WordsScreen';
import { PreviewScreen } from '../../screens/diary/preview/PreviewScreen';

const Stack = createNativeStackNavigator<DiaryFlowParamList>();

// 4ステップ日記フロー: きもち→できごと→ことば→たしかめる（screen.md 第3.2節）。
export function DiaryFlowNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Mood" component={MoodScreen} />
      <Stack.Screen name="Event" component={EventScreen} />
      <Stack.Screen name="Words" component={WordsScreen} />
      <Stack.Screen name="Preview" component={PreviewScreen} />
    </Stack.Navigator>
  );
}

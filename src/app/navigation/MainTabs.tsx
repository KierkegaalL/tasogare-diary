import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import type { MainTabParamList } from './types';
import { colors, fonts } from '../../theme';
import { HomeScreen } from '../../screens/home/HomeScreen';
import { CalendarScreen } from '../../screens/calendar/CalendarScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

// 下部タブ: ホーム / カレンダー（visual-design.html .tab-bar）。
export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.duskDeep,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.paperSoft, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.ui, fontSize: 10 },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'ホーム' }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: 'カレンダー' }} />
    </Tab.Navigator>
  );
}

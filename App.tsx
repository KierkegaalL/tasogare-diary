import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts, KleeOne_400Regular, KleeOne_600SemiBold } from '@expo-google-fonts/klee-one';
import {
  ZenMaruGothic_400Regular,
  ZenMaruGothic_500Medium,
  ZenMaruGothic_700Bold,
} from '@expo-google-fonts/zen-maru-gothic';

import { AppProviders } from './src/app/providers/AppProviders';
import { RootNavigator } from './src/app/navigation/RootNavigator';
import { colors } from './src/theme';

export default function App() {
  const [fontsLoaded] = useFonts({
    KleeOne_400Regular,
    KleeOne_600SemiBold,
    ZenMaruGothic_400Regular,
    ZenMaruGothic_500Medium,
    ZenMaruGothic_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.dusk} />
      </View>
    );
  }

  return (
    <AppProviders>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
      <StatusBar style="dark" />
    </AppProviders>
  );
}

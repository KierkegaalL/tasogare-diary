import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
import { useAuthStore } from './src/stores/authStore';
import { colors, fonts } from './src/theme';

export default function App() {
  const [fontsLoaded] = useFonts({
    KleeOne_400Regular,
    KleeOne_600SemiBold,
    ZenMaruGothic_400Regular,
    ZenMaruGothic_500Medium,
    ZenMaruGothic_700Bold,
  });

  const status = useAuthStore((s) => s.status);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!fontsLoaded || status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.dusk} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>起動に失敗しました。アプリを再起動してください。</Text>
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, padding: 24 },
  errorText: { fontFamily: fonts.uiRegular, fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
});

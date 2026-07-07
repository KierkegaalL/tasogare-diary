import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRootNavigation } from '../../app/navigation/hooks';
import { Orb } from '../../components/Orb';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, fonts, spacing } from '../../theme';

// ① ホーム（screen.md 3.1）。オーブ＋日記作成導線＋設定。
export function HomeScreen() {
  const navigation = useRootNavigation();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>たそがれ日記</Text>
        <Text style={styles.settings} onPress={() => navigation.navigate('Settings')} accessibilityRole="button">
          ⚙
        </Text>
      </View>

      <View style={styles.hero}>
        <Orb size={104} />
        <Text style={styles.line1}>今日の気持ちを、少しだけ</Text>
        <Text style={styles.line2}>言葉を選ぶだけで、日記になります</Text>
        <View style={styles.cta}>
          <PrimaryButton label="日記を書く" onPress={() => navigation.navigate('DiaryFlow', { screen: 'Mood' })} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  appTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.duskDeep },
  settings: { fontSize: 18, color: colors.inkFaint },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  line1: { fontFamily: fonts.display, fontSize: 15, color: colors.ink, marginTop: spacing.lg },
  line2: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint },
  cta: { marginTop: spacing.md },
});

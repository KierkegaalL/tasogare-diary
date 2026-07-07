import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRootNavigation } from '../../app/navigation/hooks';
import { useEntriesStore } from '../../stores/entriesStore';
import { Orb } from '../../components/Orb';
import { OrbMini } from '../../components/OrbMini';
import { EntryCard } from '../../components/EntryCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, fonts, moodColor, spacing } from '../../theme';
import { formatDateLabel, todayISO, weekDatesMonday, weekdayJa } from '../../utils/date';
import { buildMoodByDate } from '../../utils/entries';

// ① ホーム（screen.md 3.1）。オーブ＋日記作成導線＋この一週間＋最近の日記。
export function HomeScreen() {
  const navigation = useRootNavigation();
  const entries = useEntriesStore((s) => s.entries);
  const hasHydrated = useEntriesStore((s) => s.hasHydrated);

  const moodByDate = buildMoodByDate(entries);
  const weekDates = weekDatesMonday(todayISO());
  const recent = entries.slice(0, 3);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.appTitle}>たそがれ日記</Text>
          <View style={styles.headerRight}>
            <Text style={styles.dateLabel}>{formatDateLabel(todayISO())}</Text>
            <Text
              style={styles.settings}
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
              accessibilityLabel="設定"
            >
              ⚙
            </Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Orb size={104} />
          <Text style={styles.line1}>今日の気持ちを、少しだけ</Text>
          <Text style={styles.line2}>言葉を選ぶだけで、日記になります</Text>
          <View style={styles.cta}>
            <PrimaryButton label="日記を書く" onPress={() => navigation.navigate('DiaryFlow', { screen: 'Mood' })} />
          </View>
        </View>

        <Text style={styles.sectionLabel}>この一週間</Text>
        <View style={styles.weekStrip}>
          {weekDates.map((iso) => {
            const mood = moodByDate.get(iso) ?? null;
            return (
              <View key={iso} style={styles.weekDay}>
                <OrbMini size={16} color={mood ? moodColor(mood) : colors.line} />
                <Text style={styles.dow}>{weekdayJa(iso)}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>最近の日記</Text>
        {recent.length === 0 ? (
          // リハイドレート完了前は空文言を出さない（一瞬のちらつき防止）。
          hasHydrated ? (
            <Text style={styles.empty}>まだ日記がありません。今日の気持ちを綴ってみましょう。</Text>
          ) : null
        ) : (
          recent.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onPress={() => navigation.navigate('Detail', { entryId: entry.id })} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.duskDeep },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateLabel: { fontFamily: fonts.uiRegular, fontSize: 10, color: colors.inkFaint },
  settings: { fontSize: 18, color: colors.inkFaint },
  hero: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  line1: { fontFamily: fonts.display, fontSize: 15, color: colors.ink, marginTop: spacing.md },
  line2: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint },
  cta: { marginTop: spacing.md },
  sectionLabel: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint, marginTop: spacing.lg, marginBottom: spacing.md },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: 6 },
  dow: { fontFamily: fonts.uiRegular, fontSize: 9, color: colors.inkFaint },
  empty: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkFaint, lineHeight: 20 },
});

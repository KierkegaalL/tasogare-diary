import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import type { RootStackParamList } from '../../app/navigation/types';
import { useRootNavigation } from '../../app/navigation/hooks';
import { useEntriesStore } from '../../stores/entriesStore';
import { ScreenShell } from '../../components/ScreenShell';
import { MoodBadge } from '../../components/MoodBadge';
import { colors, fonts, spacing } from '../../theme';
import { formatMonthDayJa, weekdayJa } from '../../utils/date';

// ⑦ 詳細＋AI対話（screen.md 3.8）。本文・タグ・感情バッジを表示。
// TODO(Phase後半): AI対話（chat / api-contract.md 3.4）を実装。
export function DetailScreen() {
  const navigation = useRootNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Detail'>>();
  const entry = useEntriesStore((s) => s.entries.find((e) => e.id === route.params.entryId));

  if (!entry) {
    return <ScreenShell title="日記が見つかりません" onBack={() => navigation.goBack()} />;
  }

  const title = `${formatMonthDayJa(entry.date)}（${weekdayJa(entry.date)}）の日記`;

  return (
    <ScreenShell title={title} onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.body}>{entry.bodyText}</Text>

        {entry.words.length > 0 ? (
          <View style={styles.tagsRow}>
            {entry.words.map((w) => (
              <Text key={`${w.category}-${w.text}`} style={styles.tag}>
                {w.text}
              </Text>
            ))}
          </View>
        ) : null}

        <MoodBadge mood={entry.mood} />

        <View style={styles.chatSection}>
          <Text style={styles.sectionLabel}>AIと話す</Text>
          <Text style={styles.chatPlaceholder}>AIとの対話は準備中です。</Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  body: { fontFamily: fonts.display, fontSize: 15, lineHeight: 30, color: colors.ink, marginTop: spacing.sm },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { fontFamily: fonts.uiRegular, fontSize: 10, color: colors.inkSoft, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  chatSection: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg },
  sectionLabel: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint },
  chatPlaceholder: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkFaint },
});

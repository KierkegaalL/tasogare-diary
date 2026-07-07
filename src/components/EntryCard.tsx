import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { DiaryEntry } from '../types/diary';
import { colors, fonts, moodColor, spacing } from '../theme';
import { formatMonthDay } from '../utils/date';
import { OrbMini } from './OrbMini';

interface EntryCardProps {
  entry: DiaryEntry;
  onPress: () => void;
}

// ホームの「最近の日記」1件（visual-design.html .entry-card）。
export function EntryCard({ entry, onPress }: EntryCardProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Text style={styles.date}>{formatMonthDay(entry.date)}</Text>
      <Text style={styles.text} numberOfLines={1}>
        {entry.bodyText}
      </Text>
      <OrbMini size={14} color={entry.mood ? moodColor(entry.mood) : colors.line} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  pressed: { opacity: 0.7 },
  date: { fontFamily: fonts.display, fontSize: 13, color: colors.inkSoft, width: 34 },
  text: { flex: 1, fontFamily: fonts.display, fontSize: 12.5, lineHeight: 19, color: colors.ink },
});

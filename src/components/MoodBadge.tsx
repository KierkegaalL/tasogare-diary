import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MoodLevel } from '../theme';
import { colors, fonts, moodColor, moodLabel, radius, spacing } from '../theme';
import { OrbMini } from './OrbMini';

interface MoodBadgeProps {
  mood: MoodLevel | null;
}

// 感情ラベル表示（visual-design.html .mood-badge）。
export function MoodBadge({ mood }: MoodBadgeProps) {
  return (
    <View style={styles.badge}>
      <OrbMini size={14} color={mood ? moodColor(mood) : colors.line} />
      <Text style={styles.text}>{mood ? `${moodLabel(mood)}の一日` : '今日の記録'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.chip,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paperSoft,
  },
  text: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkSoft },
});

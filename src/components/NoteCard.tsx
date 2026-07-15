import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '../theme';

interface NoteCardProps {
  children: React.ReactNode;
}

// 生成した日記文のプレビュー（visual-design.html .note-card / .note-tape）。
export function NoteCard({ children }: NoteCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.tape} />
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    backgroundColor: colors.paperSoft,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    minHeight: 110,
  },
  tape: {
    position: 'absolute',
    top: -9,
    left: 26,
    width: 44,
    height: 16,
    backgroundColor: colors.tenderSoft,
    opacity: 0.85,
    transform: [{ rotate: '-3deg' }],
    borderRadius: 2,
  },
  text: { fontFamily: fonts.display, fontSize: 14.5, lineHeight: 28, color: colors.ink },
});

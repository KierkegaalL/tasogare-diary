import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../theme';

interface DividerOrProps {
  label?: string;
}

// 「または」区切り（visual-design.html .divider-or）。
export function DividerOr({ label = 'または' }: DividerOrProps) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.line },
  label: { fontFamily: fonts.uiRegular, fontSize: 10, color: colors.inkFaint },
});

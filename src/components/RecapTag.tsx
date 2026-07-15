import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '../theme';

interface RecapTagProps {
  label: string;
  value: string;
}

// 前ステップの選択を要約表示（visual-design.html .recap-tag）。
export function RecapTag({ label, value }: RecapTagProps) {
  return (
    <View style={styles.tag}>
      <Text style={styles.text}>
        {label}：<Text style={styles.value}>{value}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.chip,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paperSoft,
    alignSelf: 'flex-start',
  },
  text: { fontFamily: fonts.uiRegular, fontSize: 10.5, color: colors.inkSoft },
  value: { fontFamily: fonts.ui, color: colors.duskDeep },
});

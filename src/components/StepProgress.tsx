import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../theme';

interface StepProgressProps {
  /** 0 始まりの現在ステップindex。 */
  current: number;
  total?: number;
  label?: string;
}

// 4ステップ進捗ドット（visual-design.html .step-progress / .step-dot、architecture.md 第5.3節）。
// 灯は入力ステップに含めないため既定 total=4。
export function StepProgress({ current, total = 4, label }: StepProgressProps) {
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={`${label ?? 'ステップ'} ${current + 1}/${total}`}
    >
      <View style={styles.dots}>
        {Array.from({ length: total }).map((_, i) => {
          const dotStyle = i < current ? styles.done : i === current ? styles.current : styles.upcoming;
          return <View key={`dot-${i}`} style={[styles.dot, dotStyle]} />;
        })}
      </View>
      {label ? <Text style={styles.name}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  done: { backgroundColor: colors.duskSoft, borderWidth: 1, borderColor: colors.dusk },
  current: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.dusk },
  upcoming: { backgroundColor: colors.line },
  name: { fontFamily: fonts.ui, fontSize: 11, color: colors.duskDeep },
});

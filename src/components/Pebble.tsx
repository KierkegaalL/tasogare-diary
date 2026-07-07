import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, fonts, spacing } from '../theme';

export type PebbleShape = 'a' | 'b' | 'c';

interface PebbleProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** 有機的な角丸のバリエーション（visual-design.html .pebble-a/-b/-c）。 */
  shape?: PebbleShape;
}

// 候補・選択チップ（visual-design.html .pebble / .pebble.on）。
export function Pebble({ label, selected = false, onPress, shape = 'a' }: PebbleProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.base, SHAPES[shape], selected && styles.on, pressed && styles.pressed]}
    >
      <Text style={[styles.label, selected && styles.labelOn]}>{label}</Text>
    </Pressable>
  );
}

// 「/」構文（縦横で異なる比率）は RN 非対応のため、四隅の半径で有機的な形を近似する。
const SHAPES: Record<PebbleShape, ViewStyle> = {
  a: { borderTopLeftRadius: 20, borderTopRightRadius: 16, borderBottomRightRadius: 22, borderBottomLeftRadius: 18 },
  b: { borderTopLeftRadius: 24, borderTopRightRadius: 18, borderBottomRightRadius: 16, borderBottomLeftRadius: 20 },
  c: { borderTopLeftRadius: 16, borderTopRightRadius: 22, borderBottomRightRadius: 18, borderBottomLeftRadius: 24 },
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.sm,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperSoft,
  },
  on: { backgroundColor: colors.duskSoft, borderColor: colors.dusk },
  pressed: { opacity: 0.8 },
  label: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkSoft },
  labelOn: { fontFamily: fonts.ui, color: colors.duskDeep },
});

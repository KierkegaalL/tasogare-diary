import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius, spacing } from '../theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
}

// visual-design.html の .primary-btn / .ghost-btn に対応。
export function PrimaryButton({ label, onPress, variant = 'primary' }: PrimaryButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.ghost,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, isPrimary ? styles.primaryLabel : styles.ghostLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.button, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, alignItems: 'center' },
  primary: { backgroundColor: colors.dusk },
  ghost: { backgroundColor: colors.paperSoft, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.85 },
  label: { fontFamily: fonts.uiBold, fontSize: 14 },
  primaryLabel: { color: '#ffffff' },
  ghostLabel: { color: colors.inkSoft },
});

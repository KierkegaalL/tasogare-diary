import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, spacing } from '../theme';

interface InputRowProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}

// 一言入力＋追加ボタン（visual-design.html .input-row / .add-btn）。
export function InputRow({ value, onChangeText, onSubmit, placeholder }: InputRowProps) {
  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        blurOnSubmit
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="追加"
        onPress={onSubmit}
        style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
      >
        <Text style={styles.addIcon}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    fontSize: 13,
    fontFamily: fonts.uiRegular,
    backgroundColor: colors.paperSoft,
    color: colors.ink,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.dusk,
    backgroundColor: colors.paperSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  addIcon: { fontSize: 16, color: colors.duskDeep },
});

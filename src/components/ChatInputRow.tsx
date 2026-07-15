import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, spacing } from '../theme';

interface ChatInputRowProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

// AI対話の入力行（visual-design.html .chat-input-row / .send-btn）。
export function ChatInputRow({ value, onChangeText, onSend, disabled = false }: ChatInputRowProps) {
  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder="返信を入力…"
        placeholderTextColor={colors.inkFaint}
        returnKeyType="send"
        onSubmitEditing={onSend}
        editable={!disabled}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="送信"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onSend}
        style={({ pressed }) => [styles.sendBtn, pressed && styles.pressed, disabled && styles.disabled]}
      >
        <Text style={styles.sendLabel}>送信</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    fontSize: 12,
    fontFamily: fonts.uiRegular,
    backgroundColor: colors.paperSoft,
    color: colors.ink,
  },
  sendBtn: { backgroundColor: colors.dusk, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 16, justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  sendLabel: { fontFamily: fonts.ui, fontSize: 12, color: '#ffffff' },
});

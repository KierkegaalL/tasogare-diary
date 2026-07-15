import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ChatRole } from '../types/diary';
import { colors, fonts } from '../theme';

interface ChatBubbleProps {
  role: ChatRole;
  text: string;
}

// AI対話の吹き出し（visual-design.html .chat-bubble.ai / .me）。
export function ChatBubble({ role, text }: ChatBubbleProps) {
  const isMe = role === 'me';
  return (
    <View style={[styles.bubble, isMe ? styles.me : styles.ai]}>
      <Text style={[styles.text, isMe ? styles.textMe : styles.textAi]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%', paddingVertical: 11, paddingHorizontal: 14, borderRadius: 16, marginBottom: 11 },
  ai: { backgroundColor: colors.calmSoft, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  me: { backgroundColor: colors.duskSoft, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  text: { fontFamily: fonts.uiRegular, fontSize: 12, lineHeight: 20 },
  textAi: { color: colors.ink },
  textMe: { color: colors.duskDeep },
});

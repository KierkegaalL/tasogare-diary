import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import type { RootStackParamList } from '../../app/navigation/types';
import { useRootNavigation } from '../../app/navigation/hooks';
import { useAuthStore } from '../../stores/authStore';
import { useEntriesStore } from '../../stores/entriesStore';
import { useMessagesStore } from '../../stores/messagesStore';
import { useChat } from '../../hooks/useChat';
import { chatOpening } from '../../services/diaryApi';
import { ScreenShell } from '../../components/ScreenShell';
import { MoodBadge } from '../../components/MoodBadge';
import { ChatBubble } from '../../components/ChatBubble';
import { ChatInputRow } from '../../components/ChatInputRow';
import type { ChatMessage, ChatRole } from '../../types/diary';
import { colors, fonts, spacing } from '../../theme';
import { formatMonthDayJa, weekdayJa } from '../../utils/date';
import { makeId } from '../../utils/id';

// 空配列は安定参照にする（selector が毎回新しい [] を返すと再描画ループになるため）。
const EMPTY_MESSAGES: ChatMessage[] = [];
// Claude へ送る会話履歴は直近数往復に絞る（api-contract.md 3.4 / 第8章 最小送信）。
const HISTORY_LIMIT = 6;

const createMessage = (role: ChatRole, text: string): ChatMessage => ({
  id: makeId('m'),
  role,
  text,
  createdAt: new Date().toISOString(),
});

// ⑦ 詳細＋AI対話（screen.md 3.8）。本文・タグ・感情バッジ＋寄り添い対話。
export function DetailScreen() {
  const navigation = useRootNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Detail'>>();
  const entryId = route.params.entryId;
  const entry = useEntriesStore((s) => s.entries.find((e) => e.id === entryId));
  const uid = useAuthStore((s) => s.user?.uid);

  const messages = useMessagesStore((s) => s.messagesByEntry[entryId]) ?? EMPTY_MESSAGES;
  const addMessage = useMessagesStore((s) => s.addMessage);
  const removeMessage = useMessagesStore((s) => s.removeMessage);
  const hasHydrated = useMessagesStore((s) => s.hydratedEntries[entryId] ?? false);
  const bootstrapMessages = useMessagesStore((s) => s.bootstrap);
  const teardownMessages = useMessagesStore((s) => s.teardown);

  // entryId の対話を購読（uid スコープ）。画面を離れたら購読解除。
  useEffect(() => {
    if (!uid) return;
    bootstrapMessages(uid, entryId);
    return () => teardownMessages(entryId);
  }, [uid, entryId, bootstrapMessages, teardownMessages]);

  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;

  const chatMutation = useChat();
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState(false);
  const [openingError, setOpeningError] = useState(false);
  const openingRequested = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const busy = chatMutation.isPending;

  // 空対話時に AI の最初の問いかけを生成する（screen.md 3.8）。
  const runOpening = useCallback(() => {
    if (!entry || !uid) return;
    setOpeningError(false);
    openingRequested.current = true;
    chatOpening({ entryId, mood: entry.mood, bodyText: entry.bodyText })
      .then((res) => addMessage(uid, entryId, createMessage('ai', res.reply)))
      .catch(() => {
        openingRequested.current = false;
        setOpeningError(true);
      });
  }, [entry, uid, entryId, addMessage]);

  useEffect(() => {
    // 永続化の再水和が完了するまでは判定を保留（過去会話の重複 opening を防ぐ）。
    if (!hasHydrated || !entry || !uid || isOffline) return;
    if (messages.length > 0 || openingRequested.current) return;
    runOpening();
  }, [hasHydrated, entry, uid, isOffline, messages.length, runOpening]);

  const onSend = () => {
    const trimmed = text.trim();
    if (!trimmed || busy || !entry || !uid) return;
    setSendError(false);
    setText('');
    const meMessage = createMessage('me', trimmed);
    void addMessage(uid, entryId, meMessage).catch(() => {
      // 楽観追加自体の永続化失敗。購読には反映されないため入力を復元するのみで足りる。
      setText(trimmed);
      setSendError(true);
    });
    // history は自分の発話を加える前の直近 N 往復。
    const history = messages.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, text: m.text }));
    chatMutation.mutate(
      { entryId, message: trimmed, history },
      {
        onSuccess: (res) => {
          void addMessage(uid, entryId, createMessage('ai', res.reply)).catch(() =>
            console.warn('[chat] AI応答の保存に失敗しました'),
          );
        },
        onError: () => {
          // 失敗: 楽観追加した自分の発話を取り消し、入力を復元して再試行できるようにする。
          // ロールバック自体が失敗しても（オフライン等）UIには反映済みメッセージが残るのみで、
          // 次回のオンライン復帰時に再試行可能な状態は保たれる。
          void removeMessage(uid, entryId, meMessage.id).catch(() =>
            console.warn('[chat] 送信失敗メッセージの取り消しに失敗しました'),
          );
          setText(trimmed);
          setSendError(true);
        },
      },
    );
  };

  if (!entry) {
    return <ScreenShell title="日記が見つかりません" onBack={() => navigation.goBack()} />;
  }

  const title = `${formatMonthDayJa(entry.date)}（${weekdayJa(entry.date)}）の日記`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="戻る"
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <Text style={styles.body}>{entry.bodyText}</Text>

          {entry.words.length > 0 ? (
            <View style={styles.tagsRow}>
              {entry.words.map((w) => (
                <Text key={`${w.category}-${w.text}`} style={styles.tag}>
                  {w.text}
                </Text>
              ))}
            </View>
          ) : null}

          <MoodBadge mood={entry.mood} />

          <View style={styles.chatSection}>
            <Text style={styles.sectionLabel}>AIと話す</Text>
            {messages.map((m) => (
              <ChatBubble key={m.id} role={m.role} text={m.text} />
            ))}
            {busy ? (
              <View style={styles.typing}>
                <ActivityIndicator size="small" color={colors.calm} />
                <Text style={styles.typingText}>考えています…</Text>
              </View>
            ) : null}
            {sendError ? (
              <Text style={styles.errorText}>うまく返せませんでした。もう一度お試しください。</Text>
            ) : null}
            {openingError ? (
              <Pressable accessibilityRole="button" onPress={runOpening}>
                <Text style={styles.errorText}>最初の問いかけを取得できませんでした。タップで再試行。</Text>
              </Pressable>
            ) : null}
            {isOffline ? <Text style={styles.offlineText}>オフラインのため対話は使えません。</Text> : null}
          </View>
        </ScrollView>

        <ChatInputRow value={text} onChangeText={setText} onSend={onSend} disabled={busy || isOffline} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 14, color: colors.inkSoft },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: 14, color: colors.ink },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  body: { fontFamily: fonts.display, fontSize: 15, lineHeight: 30, color: colors.ink },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { fontFamily: fonts.uiRegular, fontSize: 10, color: colors.inkSoft, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  chatSection: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg },
  sectionLabel: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint, marginBottom: spacing.sm },
  typing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start' },
  typingText: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint },
  errorText: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.heavy },
  offlineText: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkFaint },
});

import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';

import { useDiaryFlowNavigation } from '../../../app/navigation/hooks';
import { useDraftStore } from '../../../stores/draftStore';
import { useSuggestWords } from '../../../hooks/useSuggestWords';
import { ScreenShell } from '../../../components/ScreenShell';
import { StepProgress } from '../../../components/StepProgress';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { InputRow } from '../../../components/InputRow';
import { DividerOr } from '../../../components/DividerOr';
import { Pebble, type PebbleShape } from '../../../components/Pebble';
import { RecapTag } from '../../../components/RecapTag';
import { colors, fonts, radius, spacing } from '../../../theme';

const SHAPES: PebbleShape[] = ['a', 'b', 'c'];

// ④ ことば（step3 / screen.md 3.4）。Claude 連想語提案（現状モック）→ 選択・自由追加。
export function WordsScreen() {
  const navigation = useDiaryFlowNavigation();
  const mood = useDraftStore((s) => s.mood);
  const eventWord = useDraftStore((s) => s.words.find((w) => w.category === 'event')?.text);
  const assocWords = useDraftStore((s) => s.words.filter((w) => w.category === 'assoc'));
  const addWord = useDraftStore((s) => s.addWord);
  const removeWord = useDraftStore((s) => s.removeWord);
  const setMood = useDraftStore((s) => s.setMood);
  const setEventWord = useDraftStore((s) => s.setEventWord);

  const [text, setText] = useState('');

  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;

  const events = eventWord ? [eventWord] : [];
  const { data, isLoading, isError, refetch, isFetching } = useSuggestWords(
    {
      mood,
      events,
      // selected は初回提案のみのため空配列。トグルによる再フェッチを避け、選択状態は画面側で管理する。
      selected: [],
      locale: 'ja',
    },
    !isOffline,
  );

  const assocSet = new Set(assocWords.map((w) => w.text));
  const toggleSuggestion = (word: string) => {
    if (assocSet.has(word)) {
      removeWord(word);
    } else {
      addWord({ text: word, category: 'assoc', source: 'selected' });
    }
  };

  const commitTyped = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // 気持ち・できごと・既存の連想語と重複する語は追加しない（「選んだ言葉」の重複防止）。
    if (trimmed === mood || trimmed === eventWord || assocSet.has(trimmed)) {
      setText('');
      return;
    }
    addWord({ text: trimmed, category: 'assoc', source: 'typed' });
    setText('');
  };

  // 「選んだ言葉」= 気持ち＋できごと＋選んだ連想語（生成に渡る全語）。
  const composed = [
    ...(mood ? [{ text: mood, kind: 'mood' as const }] : []),
    ...(eventWord ? [{ text: eventWord, kind: 'event' as const }] : []),
    ...assocWords.map((w) => ({ text: w.text, kind: 'assoc' as const })),
  ];

  const removeComposed = (item: { text: string; kind: 'mood' | 'event' | 'assoc' }) => {
    if (item.kind === 'mood') setMood(undefined);
    else if (item.kind === 'event') setEventWord(undefined);
    else removeWord(item.text);
  };

  const noteSubject = [mood, eventWord]
    .filter((w): w is string => Boolean(w))
    .map((w) => `「${w}」`)
    .join('');

  return (
    <ScreenShell onBack={() => navigation.goBack()} headerContent={<StepProgress current={2} label="ことば" />}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {(mood || eventWord) && (
          <View style={styles.recapRow}>
            {mood ? <RecapTag label="気持ち" value={mood} /> : null}
            {eventWord ? <RecapTag label="できごと" value={eventWord} /> : null}
          </View>
        )}

        <Text style={styles.prompt}>そこから、こんな言葉も浮かびました</Text>
        <View style={styles.note}>
          <Text style={styles.noteText}>
            {noteSubject ? `${noteSubject}と、これまでの傾向から連想しました。` : 'これまでの傾向から連想しました。'}
            気になるものを選んでみてください
          </Text>
        </View>

        {isOffline ? (
          <View style={styles.stateRow}>
            <Text style={styles.stateText}>オフラインのため連想は使えません。言葉は自由に入力できます。</Text>
          </View>
        ) : isLoading || isFetching ? (
          <View style={styles.stateRow}>
            <ActivityIndicator color={colors.dusk} />
            <Text style={styles.stateText}>言葉を探しています…</Text>
          </View>
        ) : isError ? (
          <View style={styles.stateRow}>
            <Text style={styles.stateText}>うまく思い浮かびませんでした</Text>
            <PrimaryButton label="もう一度" variant="ghost" onPress={() => refetch()} />
          </View>
        ) : (
          <View style={styles.chipRow}>
            {(data?.suggestions ?? []).map((s, i) => (
              <Pebble
                key={s.text}
                label={assocSet.has(s.text) ? `${s.text} ×` : s.text}
                shape={SHAPES[i % SHAPES.length]}
                selected={assocSet.has(s.text)}
                onPress={() => toggleSuggestion(s.text)}
              />
            ))}
          </View>
        )}

        <DividerOr label="他にしっくりくる言葉があれば" />
        <InputRow value={text} onChangeText={setText} onSubmit={commitTyped} placeholder="自由に単語を入力…" />

        <Text style={styles.selectedLabel}>選んだ言葉（{composed.length}）</Text>
        <View style={styles.chipRow}>
          {composed.map((item, i) => (
            <Pebble
              key={`${item.kind}-${item.text}`}
              label={`${item.text} ×`}
              shape={SHAPES[i % SHAPES.length]}
              selected
              onPress={() => removeComposed(item)}
            />
          ))}
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label="文章にする →"
            onPress={() => navigation.navigate('Preview')}
          />
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingBottom: spacing.xl },
  recapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  prompt: { fontFamily: fonts.display, fontSize: 16, lineHeight: 27, color: colors.ink, marginTop: spacing.sm },
  note: { backgroundColor: colors.calmSoft, borderRadius: radius.card, padding: spacing.md },
  noteText: { fontFamily: fonts.uiRegular, fontSize: 11.5, lineHeight: 20, color: colors.inkSoft },
  stateRow: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  stateText: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkFaint },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, minHeight: 36 },
  selectedLabel: { fontFamily: fonts.uiRegular, fontSize: 10.5, color: colors.inkFaint },
  actions: { marginTop: spacing.lg },
});

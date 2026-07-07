import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';

import { useDiaryFlowNavigation } from '../../../app/navigation/hooks';
import { useDraftStore } from '../../../stores/draftStore';
import { useEntriesStore } from '../../../stores/entriesStore';
import { useGenerateDiary, useAdjustDiary } from '../../../hooks/useDiaryGeneration';
import type { AdjustInstruction, GenerateDiaryResponse } from '../../../services/diaryApi';
import { makeId } from '../../../utils/id';
import { ScreenShell } from '../../../components/ScreenShell';
import { StepProgress } from '../../../components/StepProgress';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { NoteCard } from '../../../components/NoteCard';
import { Orb } from '../../../components/Orb';
import { LitOverlay } from '../../../components/LitOverlay';
import { colors, fonts, moodColor, moodLabel, radius, spacing } from '../../../theme';
import type { DiaryEntry, DiaryWord } from '../../../types/diary';
import { todayISO } from '../../../utils/date';

const ADJUSTMENTS: { label: string; instruction: AdjustInstruction }[] = [
  { label: 'もっと前向きに', instruction: 'positive' },
  { label: '短くして', instruction: 'shorter' },
  { label: '詳しく', instruction: 'detailed' },
];

// ⑤ たしかめる（step4 / screen.md 3.5）。生成文プレビュー→調整→保存→灯の演出。
export function PreviewScreen() {
  const navigation = useDiaryFlowNavigation();
  const mood = useDraftStore((s) => s.mood);
  const words = useDraftStore((s) => s.words);
  const reset = useDraftStore((s) => s.reset);
  const addEntry = useEntriesStore((s) => s.addEntry);

  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;

  const date = todayISO();
  // 生成に渡す全語（気持ち＋できごと＋連想語）。api-contract.md 3.2 の words[]。
  const requestWords = useMemo<DiaryWord[]>(
    () => [...(mood ? [{ text: mood, category: 'mood' as const, source: 'selected' as const }] : []), ...words],
    [mood, words],
  );

  const gen = useGenerateDiary(requestWords, date, !isOffline);
  const adjust = useAdjustDiary();
  const [override, setOverride] = useState<GenerateDiaryResponse | null>(null);
  const display = override ?? gen.data ?? null;

  const busy = gen.isLoading || gen.isFetching || adjust.isPending;
  const [saving, setSaving] = useState(false);
  const [lit, setLit] = useState(false);

  const onAdjust = (instruction: AdjustInstruction) => {
    if (!display || busy) return;
    adjust.mutate(
      { bodyText: display.bodyText, instruction },
      {
        onSuccess: (res) =>
          setOverride({
            bodyText: res.bodyText,
            mood: res.mood ?? display.mood, // 調整では感情ラベルを維持
            promptVersion: res.promptVersion,
          }),
      },
    );
  };

  const onSave = () => {
    if (!display || saving) return;
    setSaving(true);
    // Phase1: 端末ローカル（entriesStore）へ保存。
    // TODO(Phase2): Firestore users/{uid}/entries へ保存し、失敗時は「下書き保持＋再試行」を実装（screen.md 3.5）。
    const now = new Date().toISOString();
    const entry: DiaryEntry = {
      id: makeId(),
      date,
      mood: display.mood,
      words: requestWords,
      bodyText: display.bodyText,
      createdAt: now,
      updatedAt: now,
    };
    addEntry(entry);
    setTimeout(() => {
      setSaving(false);
      setLit(true);
    }, 400);
  };

  const onLitDone = useCallback(() => {
    reset();
    navigation.navigate('MainTabs', { screen: 'Home' });
  }, [reset, navigation]);

  if (lit) {
    return <LitOverlay mood={display?.mood ?? null} onDone={onLitDone} />;
  }

  const moodText = display?.mood ? `${moodLabel(display.mood)}の一日` : '今日の記録';

  return (
    <ScreenShell onBack={() => navigation.goBack()} headerContent={<StepProgress current={3} label="たしかめる" />}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {requestWords.length === 0 ? (
          <View style={styles.stateRow}>
            <Text style={styles.stateText}>選んだ言葉がありません。前の画面で言葉を選んでください。</Text>
            <PrimaryButton label="言葉を選ぶ" variant="ghost" onPress={() => navigation.navigate('Words')} />
          </View>
        ) : isOffline ? (
          <View style={styles.stateRow}>
            <Text style={styles.stateText}>オフラインのため文章を作成できません。オンラインで再度お試しください。</Text>
          </View>
        ) : gen.isLoading || gen.isFetching ? (
          <View style={styles.stateRow}>
            <ActivityIndicator color={colors.dusk} />
            <Text style={styles.stateText}>今日の言葉を綴っています…</Text>
          </View>
        ) : gen.isError ? (
          <View style={styles.stateRow}>
            <Text style={styles.stateText}>文章の作成に失敗しました</Text>
            <PrimaryButton label="もう一度" variant="ghost" onPress={() => gen.refetch()} />
          </View>
        ) : display ? (
          <>
            <NoteCard>{display.bodyText}</NoteCard>
            {adjust.isPending ? (
              <View style={styles.adjustingRow}>
                <ActivityIndicator size="small" color={colors.dusk} />
                <Text style={styles.stateText}>調整しています…</Text>
              </View>
            ) : null}

            <Text style={styles.adjustLabel}>調整する</Text>
            <View style={styles.adjustRow}>
              {ADJUSTMENTS.map((a) => (
                <AdjustChip key={a.instruction} label={a.label} disabled={busy} onPress={() => onAdjust(a.instruction)} />
              ))}
              <AdjustChip label="↻ 選び直す" disabled={busy} onPress={() => navigation.navigate('Words')} />
            </View>

            <View style={styles.moodRow}>
              <Orb size={22} color={display.mood ? moodColor(display.mood) : colors.dusk} />
              <View style={styles.moodTextWrap}>
                <Text style={styles.moodText}>{moodText}</Text>
                <Text style={styles.moodNote}>保存後もいつでも調整できます</Text>
              </View>
            </View>

            <PrimaryButton
              label={saving ? '保存中…' : '保存する'}
              onPress={onSave}
              disabled={busy || saving}
            />
          </>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

// 調整用の小さなゴーストボタン（visual-design.html .adjust-row .ghost-btn）。
function AdjustChip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed, disabled && styles.chipDisabled]}
    >
      <Text style={styles.chipLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingBottom: spacing.xl, paddingTop: spacing.md },
  stateRow: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  stateText: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkFaint, textAlign: 'center' },
  adjustingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  adjustLabel: { fontFamily: fonts.uiRegular, fontSize: 10.5, color: colors.inkFaint },
  adjustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: 14,
  },
  chipPressed: { opacity: 0.8 },
  chipDisabled: { opacity: 0.5 },
  chipLabel: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkSoft },
  moodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  moodTextWrap: { flex: 1 },
  moodText: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkSoft },
  moodNote: { fontFamily: fonts.uiRegular, fontSize: 10.5, color: colors.inkFaint, marginTop: 2 },
});

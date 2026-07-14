import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useIsOffline } from '../../../hooks/useIsOffline';
import { useDiaryFlowNavigation } from '../../../app/navigation/hooks';
import { useDraftStore } from '../../../stores/draftStore';
import { useEntriesStore } from '../../../stores/entriesStore';
import { useAuthStore } from '../../../stores/authStore';
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
import type { DiaryWord } from '../../../types/diary';
import { todayISO } from '../../../utils/date';
import { wordsKey } from '../../../utils/diaryWords';
import { buildDiaryEntry } from './buildDiaryEntry';

const ADJUSTMENTS: { label: string; instruction: AdjustInstruction }[] = [
  { label: 'もっと前向きに', instruction: 'positive' },
  { label: '短くして', instruction: 'shorter' },
  { label: '詳しく', instruction: 'detailed' },
];

// Firestore は永続化未設定（RN では IndexedDB 不在のためメモリキャッシュ中心。architecture.md 第7章）のため、
// オフライン中に発行した書き込みの Promise はオンライン復帰まで解決しない。タップ直後はオンラインでも、
// 送信中に回線が切れると「保存中…」のまま無期限にハングしうるため、タイムアウトで打ち切ってエラー表示に倒す
// （下書きは reset() を呼ばない限り draftStore に残るため、再試行できる）。
const SAVE_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('save-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ⑤ たしかめる（step4 / screen.md 3.5）。生成文プレビュー→調整→保存→灯の演出。
export function PreviewScreen() {
  const navigation = useDiaryFlowNavigation();
  const mood = useDraftStore((s) => s.mood);
  const words = useDraftStore((s) => s.words);
  const awareness = useDraftStore((s) => s.awareness);
  const reset = useDraftStore((s) => s.reset);
  const addEntry = useEntriesStore((s) => s.addEntry);
  const uid = useAuthStore((s) => s.user?.uid);

  const isOffline = useIsOffline();

  const date = todayISO();
  // 生成に渡す全語（気持ち＋できごと＋連想語）。api-contract.md 3.2 の words[]。
  const requestWords = useMemo<DiaryWord[]>(
    () => [...(mood ? [{ text: mood, category: 'mood' as const, source: 'selected' as const }] : []), ...words],
    [mood, words],
  );

  // 「選び直す」（Words画面へnavigate）は画面をアンマウントしない（stack上に既存のPreviewへ戻るだけ）ため、
  // words が変わったことを検知するキー。変化時に下の useEffect で override 等をリセットする。
  const currentWordsKey = useMemo(() => wordsKey(requestWords), [requestWords]);

  const gen = useGenerateDiary(requestWords, date, !isOffline);
  const adjust = useAdjustDiary();
  const [override, setOverride] = useState<GenerateDiaryResponse | null>(null);
  const display = override ?? gen.data ?? null;

  const busy = gen.isLoading || gen.isFetching || adjust.isPending;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saveTimedOut, setSaveTimedOut] = useState(false);
  // タイムアウト後も前回の書き込み（setDoc）は裏で生存しうる（Firestore は永続キューを持たず、
  // Promise がオンライン復帰まで解決しないだけで処理自体は止まらない）。決着前に新規保存を
  // 許すと、同日付ドキュメントの有無を都度 getDocs で確認する upsert（1日1件・U-11）が競合し、
  // 別IDで2件保存されうる（reviewer指摘）ため、決着するまで新規保存を禁止する。
  const [writeInFlight, setWriteInFlight] = useState(false);
  const [lit, setLit] = useState(false);
  // 適用した調整の履歴（data.md 3.2 entries.adjustments）。
  const [appliedAdjustments, setAppliedAdjustments] = useState<AdjustInstruction[]>([]);

  // words が変わった（選び直した）ら、古い調整結果・調整履歴・保存エラーを引きずらないようにする。
  // 画面がアンマウントされない（stack上に既存のPreviewへ戻るだけ）ため useState の初期値だけでは
  // 対応できない（レビュー指摘）。レンダー中に state を調整する公式パターンで対応する
  // （https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes）。
  const [prevWordsKey, setPrevWordsKey] = useState(currentWordsKey);
  if (currentWordsKey !== prevWordsKey) {
    setPrevWordsKey(currentWordsKey);
    setOverride(null);
    setAppliedAdjustments([]);
    setSaveError(false);
    setSaveTimedOut(false);
  }

  const onAdjust = (instruction: AdjustInstruction) => {
    if (!display || busy || isOffline) return;
    adjust.mutate(
      { bodyText: display.bodyText, instruction },
      {
        onSuccess: (res) => {
          setOverride({
            bodyText: res.bodyText,
            mood: res.mood ?? display.mood, // 調整では感情ラベルを維持
            promptVersion: res.promptVersion,
            model: res.model,
          });
          setAppliedAdjustments((prev) => [...prev, instruction]);
        },
      },
    );
  };

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const onSave = async () => {
    // オフライン中は Firestore への書き込み Promise がオンライン復帰まで解決しないため、
    // ハングを避けて開始しない（保存ボタンも isOffline で無効化済み。下書きは draftStore に残る）。
    // writeInFlight は前回の書き込みがタイムアウト後もまだ裏で決着していない間、再試行を禁止する。
    if (!display || saving || !uid || isOffline || writeInFlight) return;
    setSaving(true);
    setSaveError(false);
    setSaveTimedOut(false);
    // リポジトリ層（ローカル/Firestore）へ保存。id は自動生成、1日1件（U-11）は date による
    // upsert で担保する（data.md 3.2: 自動ID＋date、スキーマは複数許容のまま）。
    // 失敗時は下書き（draftStore）を保持したまま再試行できるようにする（screen.md 3.5）。
    const entry = buildDiaryEntry({
      id: makeId(),
      date,
      display,
      requestWords,
      awareness,
      appliedAdjustments,
      now: new Date().toISOString(),
    });
    setWriteInFlight(true);
    const writePromise = addEntry(uid, entry).finally(() => {
      if (isMountedRef.current) setWriteInFlight(false);
    });
    try {
      await withTimeout(writePromise, SAVE_TIMEOUT_MS);
      if (!isMountedRef.current) return;
      setSaving(false);
      setLit(true);
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === 'save-timeout';
      // 日記本文・uid はログしない（constraints.md）。FirebaseError の message には
      // ドキュメントパス（uid を含む）が入りうるため message 自体もログしない。
      if (!isTimeout) {
        console.warn('diary save failed', (err as { code?: string })?.code, (err as Error)?.name);
      }
      if (!isMountedRef.current) return;
      setSaving(false);
      setSaveError(true);
      setSaveTimedOut(isTimeout);
    }
  };

  const onLitDone = useCallback(() => {
    reset();
    navigation.navigate('MainTabs', { screen: 'Home' });
  }, [reset, navigation]);

  if (lit) {
    return <LitOverlay mood={display?.mood ?? null} awareness={awareness} onDone={onLitDone} />;
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
        ) : display ? (
          // display は一度生成できれば保持される。後から isOffline になっても、既に生成済みの
          // 本文・保存ボタンを隠さない（隠すと保存操作自体ができなくなってしまうため）。
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
                <AdjustChip
                  key={a.instruction}
                  label={a.label}
                  disabled={busy || isOffline}
                  onPress={() => onAdjust(a.instruction)}
                />
              ))}
              <AdjustChip
                label="↻ 選び直す"
                disabled={busy || isOffline}
                onPress={() => navigation.navigate('Words')}
              />
            </View>

            <View style={styles.moodRow}>
              <Orb size={22} color={display.mood ? moodColor(display.mood) : colors.dusk} />
              <View style={styles.moodTextWrap}>
                <Text style={styles.moodText}>{moodText}</Text>
                <Text style={styles.moodNote}>保存後もいつでも調整できます</Text>
              </View>
            </View>

            {saving ? null : isOffline ? (
              <Text style={styles.stateText}>
                オフラインのため保存できません。下書きは保持されています。オンラインになってからお試しください。
              </Text>
            ) : saveError ? (
              <Text style={styles.stateText}>
                {saveTimedOut
                  ? '通信状態が不安定で保存に時間がかかっています。下書きは保持されています。オンラインになってからもう一度お試しください。'
                  : '保存に失敗しました。下書きは保持されています。もう一度お試しください。'}
              </Text>
            ) : null}

            <PrimaryButton
              label={saving ? '保存中…' : saveError ? 'もう一度保存する' : '保存する'}
              onPress={onSave}
              disabled={busy || saving || isOffline || writeInFlight}
            />
          </>
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

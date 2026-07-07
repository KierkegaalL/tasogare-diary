import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { WordSource } from '../../types/diary';
import { ScreenShell } from '../../components/ScreenShell';
import { StepProgress } from '../../components/StepProgress';
import { PrimaryButton } from '../../components/PrimaryButton';
import { InputRow } from '../../components/InputRow';
import { DividerOr } from '../../components/DividerOr';
import { Pebble } from '../../components/Pebble';
import type { PebbleShape } from '../../components/Pebble';
import { RecapTag } from '../../components/RecapTag';
import { colors, fonts, spacing } from '../../theme';

interface RecapItem {
  label: string;
  value: string;
}

interface SingleWordStepProps {
  stepIndex: number;
  stepLabel: string;
  prompt: string;
  promptSub: string;
  placeholder: string;
  chipLabel: string;
  chips: string[];
  /** 現在選択中の語（自由入力/チップ共通）。 */
  selected: string | undefined;
  recap?: RecapItem[];
  onSelect: (word: string, source: WordSource) => void;
  onClear: () => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

const SHAPES: PebbleShape[] = ['a', 'b', 'c'];

// きもち/できごと 共通の単一選択ステップUI（screen.md 3.2 / 3.3）。
// 一言入力 or 候補チップから1つ選ぶ。プレゼンテーションのみ（状態は呼び出し側）。
export function SingleWordStep({
  stepIndex,
  stepLabel,
  prompt,
  promptSub,
  placeholder,
  chipLabel,
  chips,
  selected,
  recap,
  onSelect,
  onClear,
  onBack,
  onNext,
  onSkip,
}: SingleWordStepProps) {
  const [text, setText] = useState('');

  const commitTyped = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSelect(trimmed, 'typed');
    setText('');
  };

  const toggleChip = (word: string) => {
    if (selected === word) {
      onClear();
    } else {
      onSelect(word, 'selected');
    }
  };

  // 選択面はチップ行に一本化（visual-design.html mood1/event1 は input-row + chip-row のみ）。
  // 自由入力（typed）で選んだ語がチップ一覧に無い場合は、チップ行末尾に追加して .pebble.on で示す。
  const displayChips =
    selected !== undefined && !chips.includes(selected) ? [...chips, selected] : chips;

  return (
    <ScreenShell onBack={onBack} headerContent={<StepProgress current={stepIndex} label={stepLabel} />}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {recap && recap.length > 0 ? (
          <View style={styles.recapRow}>
            {recap.map((r) => (
              <RecapTag key={r.label} label={r.label} value={r.value} />
            ))}
          </View>
        ) : null}

        <Text style={styles.prompt}>{prompt}</Text>
        <Text style={styles.promptSub}>{promptSub}</Text>

        <InputRow value={text} onChangeText={setText} onSubmit={commitTyped} placeholder={placeholder} />

        <DividerOr />

        <Text style={styles.chipLabel}>{chipLabel}</Text>
        <View style={styles.chipRow}>
          {displayChips.map((word, i) => (
            <Pebble
              key={word}
              label={word}
              shape={SHAPES[i % SHAPES.length]}
              selected={selected === word}
              onPress={() => toggleChip(word)}
            />
          ))}
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="次へ →" onPress={onNext} />
          <Text accessibilityRole="link" style={styles.skip} onPress={onSkip}>
            今は思い浮かばない
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingBottom: spacing.xl },
  recapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  prompt: { fontFamily: fonts.display, fontSize: 16, lineHeight: 27, color: colors.ink, marginTop: spacing.sm },
  promptSub: { fontFamily: fonts.uiRegular, fontSize: 11.5, color: colors.inkFaint, marginTop: -spacing.sm },
  chipLabel: { fontFamily: fonts.uiRegular, fontSize: 10.5, color: colors.inkFaint },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { marginTop: spacing.lg, gap: spacing.md },
  skip: {
    textAlign: 'center',
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    color: colors.inkFaint,
    textDecorationLine: 'underline',
  },
});

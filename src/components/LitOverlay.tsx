import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MoodLevel } from '../theme';
import { colors, fonts, moodColor, motion, spacing } from '../theme';
import { Orb } from './Orb';

interface LitOverlayProps {
  mood: MoodLevel | null;
  onDone: () => void;
}

// 「灯」の演出（保存後 / screen.md 3.6, architecture.md 8.2）。
// 専用入力画面ではなく、保存完了のクロージング表現。一定時間後に onDone（ホーム復帰）。
export function LitOverlay({ mood, onDone }: LitOverlayProps) {
  const [opacity] = useState(() => new Animated.Value(0));
  // onDone は最新参照を ref に保持し、タイマーは初回マウント時のみ張る（親再レンダーで再発火させない）。
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      Animated.timing(opacity, {
        toValue: 1,
        duration: reduce ? 0 : 600,
        useNativeDriver: true,
      }).start();
    });
    // TODO(architecture.md 8.2): グロー→感情色への収束→気づき一言(entries.awareness) の
    //   段階演出は実装フェーズで拡張する。現状は単一フェードイン＋固定文言。
    const timer = setTimeout(() => onDoneRef.current(), motion.lit.durationMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [opacity]);

  return (
    <SafeAreaView style={styles.fill}>
      <Animated.View style={[styles.center, { opacity }]}>
        <Orb size={120} color={mood ? moodColor(mood) : colors.dusk} />
        <Text style={styles.title}>こころの灯が灯りました</Text>
        <Text style={styles.sub}>今日もおつかれさまでした</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginTop: spacing.md },
  sub: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkFaint },
});

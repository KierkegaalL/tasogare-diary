import React, { useEffect, useId, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import type { MoodLevel } from '../theme';
import { colors, fonts, moodColor, motion, spacing } from '../theme';
import { Orb } from './Orb';

interface LitOverlayProps {
  mood: MoodLevel | null;
  /** 気づき一言（entries.awareness）。未設定時は既定文言を表示する。 */
  awareness?: string;
  onDone: () => void;
}

const ORB_SIZE = 120;

// 「灯」の演出（保存後 / screen.md 3.6, architecture.md 8.2）。
// 専用入力画面ではなく、保存完了のクロージング表現。
// 段階: (1) グロー（一瞬明度が上がる）→ (2) 当日の感情色へ収束 → (3) 気づき一言をフェード表示。
// reduced-motion 時はグローを省略し、感情色反映＋一言表示を同時にクロスフェードする。
export function LitOverlay({ mood, awareness, onDone }: LitOverlayProps) {
  const glowGradientId = useId().replace(/[^a-zA-Z0-9]/g, '');
  // onDone は最新参照を ref に保持し、タイマーは初回マウント時のみ張る（親再レンダーで再発火させない）。
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const contentOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;

      if (reduceMotion) {
        // グローを省略し、感情色反映＋一言表示を同時にクロスフェード。
        contentOpacity.value = withTiming(1, { duration: 250, easing: Easing.linear });
        textOpacity.value = withTiming(1, { duration: 250, easing: Easing.linear });
      } else {
        contentOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
        // (1) 一瞬明度が上がる（グロー）→ (2) フェードアウトして感情色へ落ち着く。
        glowOpacity.value = withSequence(
          withTiming(1, { duration: 220, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 480, easing: Easing.out(Easing.ease) }),
        );
        // (3) 気づき一言は落ち着いた頃に少し遅れてフェード表示。
        textOpacity.value = withDelay(500, withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) }));
      }
    });

    const timer = setTimeout(() => onDoneRef.current(), motion.lit.durationMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  return (
    <SafeAreaView style={styles.fill}>
      <Animated.View style={[styles.center, contentStyle]}>
        <View style={styles.orbWrap}>
          <Orb size={ORB_SIZE} color={mood ? moodColor(mood) : colors.dusk} />
          <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]}>
            {/* グローは duskSoft〜白のハイライト（architecture.md 8.2）。感情色への収束はこの層のフェードアウトで表現する。 */}
            <Svg width={ORB_SIZE} height={ORB_SIZE} viewBox="0 0 100 100">
              <Defs>
                <RadialGradient id={glowGradientId} cx="35%" cy="30%" r="75%">
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
                  <Stop offset="100%" stopColor={colors.duskSoft} stopOpacity={1} />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill={`url(#${glowGradientId})`} />
            </Svg>
          </Animated.View>
        </View>
        <Text style={styles.title}>こころの灯が灯りました</Text>
        <Animated.View style={textStyle}>
          <Text style={styles.sub}>{awareness || '今日もおつかれさまでした'}</Text>
        </Animated.View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: spacing.lg },
  orbWrap: { width: ORB_SIZE, height: ORB_SIZE, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    overflow: 'hidden',
  },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginTop: spacing.md },
  sub: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkFaint },
});

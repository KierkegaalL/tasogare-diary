import React, { useEffect, useId } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

import { colors, motion } from '../theme';

interface OrbProps {
  size?: number;
  /**
   * 感情色を渡すと「感情別の小オーブ」配色（白ハイライト→単色、architecture.md 8.1）になる。
   * 未指定時はホーム大オーブの既定配色（calm→tender→dusk の3色グラデーション）になる。
   */
  color?: string;
}

// 「こころの灯」オーブ（呼吸するサイン）。
// architecture.md 8.1: breathe scale 1↔1.055 / 4.8s ease-in-out、UIスレッド駆動（react-native-reanimated）。
// 塗りは react-native-svg の RadialGradient で visual-design.html の radial-gradient を再現する。
export function Orb({ size = 104, color }: OrbProps) {
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const scale = useSharedValue<number>(motion.breathe.scaleFrom);

  useEffect(() => {
    const apply = (reduceMotion: boolean) => {
      cancelAnimation(scale);
      if (reduceMotion) {
        scale.value = motion.breathe.scaleFrom;
        return;
      }
      const half = motion.breathe.durationMs / 2;
      scale.value = withRepeat(
        withTiming(motion.breathe.scaleTo, { duration: half, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    };

    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!cancelled) apply(reduceMotion);
    });
    // 起動中の端末設定変更にも追従する。
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', apply);

    return () => {
      cancelled = true;
      sub.remove();
      cancelAnimation(scale);
    };
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      accessibilityRole="image"
      accessibilityLabel="こころの灯"
      style={[styles.orb, { width: size, height: size }, animatedStyle]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          {color ? (
            // 感情別の小オーブ: radial-gradient(circle at 35% 30%, #fff8, <感情色>)
            <RadialGradient id={gradientId} cx="35%" cy="30%" r="75%">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.53} />
              <Stop offset="100%" stopColor={color} stopOpacity={1} />
            </RadialGradient>
          ) : (
            // ホーム大オーブ: radial-gradient(circle at 32% 28%, #ffffffaa 0%, calm 0%, tender 55%, dusk 100%)
            // 原文は白と calm が同一 0% だが、SVG は同一オフセットで後勝ちのため白が不可視になる。
            // ハイライトの意図（起点が白であること）を再現するため、白の終端にごく僅かな幅を持たせる
            // （architecture.md 8.1: 「実装時にグラデーションの意図を確認しつつ再現する」に対応）。
            <RadialGradient id={gradientId} cx="32%" cy="28%" r="75%">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.667} />
              <Stop offset="6%" stopColor={colors.calm} stopOpacity={1} />
              <Stop offset="55%" stopColor={colors.tender} stopOpacity={1} />
              <Stop offset="100%" stopColor={colors.dusk} stopOpacity={1} />
            </RadialGradient>
          )}
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  orb: {
    shadowColor: colors.duskDeep,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
});

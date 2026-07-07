import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';

import { colors, motion } from '../theme';

interface OrbProps {
  size?: number;
  /** オーブの基調色（感情色を渡す。既定はたそがれ紫）。 */
  color?: string;
}

// 「こころの灯」オーブ（呼吸するサイン）。
// architecture.md 第8章: breathe scale 1↔1.055 / 4.8s。reduced-motion で停止。
// NOTE: 本スキャフォールドは組み込み Animated + 単色近似で実装。
//       本番のラジアルグラデーション/UIスレッド駆動（reanimated）は実装フェーズで差し替える。
export function Orb({ size = 104, color = colors.dusk }: OrbProps) {
  // 安定した Animated.Value を1度だけ生成（React 19: レンダー中の ref アクセスを避ける）。
  const [scale] = useState(() => new Animated.Value(motion.breathe.scaleFrom));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;

    const startBreathe = () => {
      const half = motion.breathe.durationMs / 2;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, {
            toValue: motion.breathe.scaleTo,
            duration: half,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: motion.breathe.scaleFrom,
            duration: half,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    };

    const stopBreathe = () => {
      loop?.stop();
      loop = undefined;
      scale.setValue(motion.breathe.scaleFrom);
    };

    const apply = (reduceMotion: boolean) => {
      stopBreathe();
      if (!reduceMotion) startBreathe();
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
      stopBreathe();
    };
  }, [scale]);

  return (
    <Animated.View
      accessibilityRole="image"
      accessibilityLabel="こころの灯"
      style={[
        styles.orb,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        { transform: [{ scale }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  orb: {
    // 単色近似のハイライト（簡易）。本番はラジアルグラデーションに置換。
    shadowColor: colors.duskDeep,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
});

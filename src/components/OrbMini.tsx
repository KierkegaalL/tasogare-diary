import React from 'react';
import { View } from 'react-native';

import { colors } from '../theme';

interface OrbMiniProps {
  size?: number;
  /** 感情色。未記録日は colors.line を渡す。 */
  color?: string;
}

// 一覧・カレンダー・バッジ用の小さな静的オーブ（visual-design.html .orb-mini）。
// 呼吸アニメは付けない（多数表示・パフォーマンス配慮）。
export function OrbMini({ size = 14, color = colors.line }: OrbMiniProps) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

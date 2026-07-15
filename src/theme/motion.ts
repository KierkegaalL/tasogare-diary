// アニメーション定数。visual-design.html / architecture.md 第8章を正。
// prefers-reduced-motion 相当時は停止・簡略化する（各コンポーネントで判定）。
export const motion = {
  // 呼吸するオーブ（@keyframes breathe: scale 1↔1.055, 4.8s ease-in-out）
  breathe: { durationMs: 4800, scaleFrom: 1, scaleTo: 1.055 },
  // 灯る演出（保存後）: ~1.2–1.6s。数値は実機で調整（architecture.md 8.2）
  lit: { durationMs: 1400 },
  // softPulse（ビューファインダ/待機ドット）
  softPulse: { durationMs: 2600 },
} as const;

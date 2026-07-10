// 配色・感情トークンは shared/theme/tokens.ts を正とする（Web と共有。architecture.md 第6章）。
// visual-design.html v1 の CSS 変数（:root）が一次情報。ハードコード禁止・shared に集約。
// 既存の import パス（'../theme' / './colors'）を保つため、ここでは再エクスポートのみを行う。
export { colors, MOOD_LEVELS, moodColor, moodLabel } from '../../shared/theme/tokens';
export type { MoodLevel } from '../../shared/theme/tokens';

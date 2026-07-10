// 配色トークン。visual-design.html v1 の CSS 変数（:root）を正とする。
// architecture.md 第5.1節・第6章（shared パッケージで型・トークンを共有）。
// モバイル（src/theme/colors.ts）と Web（web/src/app/globals.css）の双方がここを参照する。
// ハードコード禁止・本ファイルに集約。
export const colors = {
  paper: '#F1EFEE',
  paperSoft: '#FBFAF8',
  ink: '#302E3A',
  inkSoft: '#726F7C',
  inkFaint: '#ACA9B2',
  dusk: '#8C6F8C',
  duskDeep: '#6F5670',
  duskSoft: '#EFE7EE',
  calm: '#7FA48F',
  calmSoft: '#E6EDE8',
  tender: '#C0975A',
  tenderSoft: '#F2E9D8',
  heavy: '#B27E7E',
  heavySoft: '#F1E2E1',
  line: '#E5E1DD',
} as const;

// 感情ラベル（data.md 第4章 / U-10: 当面3段階固定）
export const MOOD_LEVELS = ['calm', 'tender', 'heavy'] as const;
export type MoodLevel = (typeof MOOD_LEVELS)[number];

const MOOD_LABELS: Record<MoodLevel, string> = {
  calm: '穏やか',
  tender: 'やや疲れ',
  heavy: 'しんどい',
};

export const moodColor = (mood: MoodLevel): string => colors[mood];
export const moodLabel = (mood: MoodLevel): string => MOOD_LABELS[mood];

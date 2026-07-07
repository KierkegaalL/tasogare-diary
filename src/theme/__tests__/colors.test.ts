import { colors, moodColor, moodLabel, MOOD_LEVELS } from '../colors';

describe('theme/colors', () => {
  it('感情レベルは3段階（U-10: 当面3段階固定）', () => {
    expect(MOOD_LEVELS).toEqual(['calm', 'tender', 'heavy']);
  });

  it('moodColor は visual-design.html の感情色を返す', () => {
    expect(moodColor('calm')).toBe('#7FA48F');
    expect(moodColor('tender')).toBe('#C0975A');
    expect(moodColor('heavy')).toBe('#B27E7E');
  });

  it('moodLabel は日本語ラベルを返す', () => {
    expect(moodLabel('calm')).toBe('穏やか');
    expect(moodLabel('tender')).toBe('やや疲れ');
    expect(moodLabel('heavy')).toBe('しんどい');
  });

  it('たそがれ主アクセント色が定義されている', () => {
    expect(colors.dusk).toBe('#8C6F8C');
  });
});

import { suggestWords } from '../diaryApi';

describe('diaryApi.suggestWords (mock)', () => {
  it('連想語（assoc）を返し、気持ち・できごとの語は除外する', async () => {
    const res = await suggestWords({ mood: '疲れた', events: ['カフェ'], selected: [], locale: 'ja' });

    expect(res.suggestions.length).toBeGreaterThan(0);
    expect(res.suggestions.length).toBeLessThanOrEqual(7);
    expect(res.suggestions.every((s) => s.category === 'assoc')).toBe(true);

    const texts = res.suggestions.map((s) => s.text);
    expect(texts).not.toContain('カフェ'); // できごとは除外
    expect(texts).not.toContain('疲れた'); // 気持ちは除外
    expect(texts).toContain('コーヒー'); // できごと連想の種
    expect(new Set(texts).size).toBe(texts.length); // 重複なし
  });

  it('selected に含まれる語は候補から除外する', async () => {
    const res = await suggestWords({
      mood: '疲れた',
      events: ['仕事'],
      selected: ['締め切り'],
      locale: 'ja',
    });
    expect(res.suggestions.map((s) => s.text)).not.toContain('締め切り');
  });
});

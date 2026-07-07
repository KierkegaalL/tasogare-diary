import { adjustDiary, generateDiary, suggestWords } from '../diaryApi';
import type { DiaryWord } from '../../types/diary';

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

const WORDS: DiaryWord[] = [
  { text: '疲れた', category: 'mood', source: 'selected' },
  { text: 'カフェ', category: 'event', source: 'selected' },
  { text: '友達', category: 'assoc', source: 'selected' },
];

describe('diaryApi.generateDiary (mock)', () => {
  it('本文と推定感情ラベルを返す（疲れた→tender）', async () => {
    const res = await generateDiary({ words: WORDS, date: '2026-07-01', locale: 'ja' });
    expect(res.bodyText.length).toBeGreaterThan(0);
    expect(res.bodyText).toContain('カフェ');
    expect(res.mood).toBe('tender');
    expect(res.promptVersion).toBe('diary-v1-mock');
  });

  it('語が無い場合でも本文を返し、mood は null', async () => {
    const res = await generateDiary({ words: [], date: '2026-07-01', locale: 'ja' });
    expect(res.bodyText.length).toBeGreaterThan(0);
    expect(res.mood).toBeNull();
  });
});

describe('diaryApi.adjustDiary (mock)', () => {
  const base = '今日はカフェで過ごした。友達が心に残っている。疲れた気持ちの一日だった。';

  it('short は最初の一文に短縮する', async () => {
    const res = await adjustDiary({ bodyText: base, instruction: 'shorter', locale: 'ja' });
    expect(res.bodyText).toBe('今日はカフェで過ごした。');
  });

  it('positive は前向きな一文を加える', async () => {
    const res = await adjustDiary({ bodyText: base, instruction: 'positive', locale: 'ja' });
    expect(res.bodyText).toContain('悪くない一日');
    expect(res.bodyText.length).toBeGreaterThan(base.length);
  });

  it('detailed は詳しい一文を加える', async () => {
    const res = await adjustDiary({ bodyText: base, instruction: 'detailed', locale: 'ja' });
    expect(res.bodyText).toContain('思い返していた');
    expect(res.bodyText.length).toBeGreaterThan(base.length);
  });
});

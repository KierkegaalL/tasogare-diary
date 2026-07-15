import { buildDiaryEntry } from '../buildDiaryEntry';
import type { DiaryWord } from '../../../../types/diary';

const WORDS: DiaryWord[] = [
  { text: '疲れた', category: 'mood', source: 'selected' },
  { text: 'カフェ', category: 'event', source: 'selected' },
];

describe('buildDiaryEntry（data.md 3.2）', () => {
  it('source を常に付与する（model/promptVersion は display から）', () => {
    const entry = buildDiaryEntry({
      id: 'e1',
      date: '2026-07-01',
      display: { bodyText: '本文', mood: 'tender', promptVersion: 'diary-v1', model: 'gemini-3.5-flash' },
      requestWords: WORDS,
      appliedAdjustments: [],
      now: '2026-07-01T12:00:00.000Z',
    });

    expect(entry.source).toEqual({ model: 'gemini-3.5-flash', promptVersion: 'diary-v1' });
    expect(entry.bodyText).toBe('本文');
    expect(entry.mood).toBe('tender');
    expect(entry.words).toBe(WORDS);
    expect(entry.createdAt).toBe('2026-07-01T12:00:00.000Z');
    expect(entry.updatedAt).toBe('2026-07-01T12:00:00.000Z');
  });

  it('adjustments が空なら省略する（Firestore は undefined フィールドを許容しないため）', () => {
    const entry = buildDiaryEntry({
      id: 'e1',
      date: '2026-07-01',
      display: { bodyText: '本文', mood: 'tender', promptVersion: 'diary-v1', model: 'gemini-3.5-flash' },
      requestWords: WORDS,
      appliedAdjustments: [],
      now: '2026-07-01T12:00:00.000Z',
    });

    expect('adjustments' in entry).toBe(false);
  });

  it('adjustments が1件以上あれば適用順のまま保存する', () => {
    const entry = buildDiaryEntry({
      id: 'e1',
      date: '2026-07-01',
      display: { bodyText: '調整後', mood: 'tender', promptVersion: 'adjust-v1', model: 'gemini-3.1-flash-lite' },
      requestWords: WORDS,
      appliedAdjustments: ['positive', 'shorter'],
      now: '2026-07-01T12:00:00.000Z',
    });

    expect(entry.adjustments).toEqual(['positive', 'shorter']);
    expect(entry.source).toEqual({ model: 'gemini-3.1-flash-lite', promptVersion: 'adjust-v1' });
  });

  it('awareness が無ければ省略する', () => {
    const entry = buildDiaryEntry({
      id: 'e1',
      date: '2026-07-01',
      display: { bodyText: '本文', mood: null, promptVersion: 'diary-v1', model: 'gemini-3.5-flash' },
      requestWords: WORDS,
      appliedAdjustments: [],
      now: '2026-07-01T12:00:00.000Z',
    });

    expect('awareness' in entry).toBe(false);
  });

  it('awareness があれば含める', () => {
    const entry = buildDiaryEntry({
      id: 'e1',
      date: '2026-07-01',
      display: { bodyText: '本文', mood: null, promptVersion: 'diary-v1', model: 'gemini-3.5-flash' },
      requestWords: WORDS,
      awareness: '少し休めた',
      appliedAdjustments: [],
      now: '2026-07-01T12:00:00.000Z',
    });

    expect(entry.awareness).toBe('少し休めた');
  });
});

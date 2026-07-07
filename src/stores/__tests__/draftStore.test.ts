import { useDraftStore } from '../draftStore';

const draft = () => useDraftStore.getState();
const eventWords = () => draft().words.filter((w) => w.category === 'event');

describe('draftStore', () => {
  beforeEach(() => {
    draft().reset();
  });

  it('setMood は気持ちを設定・解除できる', () => {
    draft().setMood('疲れた');
    expect(draft().mood).toBe('疲れた');
    draft().setMood(undefined);
    expect(draft().mood).toBeUndefined();
  });

  it('setEventWord は単一の event 語として置き換える', () => {
    draft().setEventWord('カフェ');
    expect(eventWords()).toEqual([{ text: 'カフェ', category: 'event', source: 'selected' }]);

    // 別の語を選ぶと置き換わる（複数にならない）
    draft().setEventWord('仕事');
    expect(eventWords()).toEqual([{ text: '仕事', category: 'event', source: 'selected' }]);

    // 自由入力は source='typed'
    draft().setEventWord('散歩', 'typed');
    expect(eventWords()).toEqual([{ text: '散歩', category: 'event', source: 'typed' }]);

    // undefined で解除
    draft().setEventWord(undefined);
    expect(eventWords()).toEqual([]);
  });

  it('addWord は assoc 語を追加し、event 語と共存する', () => {
    draft().setEventWord('カフェ');
    draft().addWord({ text: '友達', category: 'assoc', source: 'selected' });
    draft().addWord({ text: '友達', category: 'assoc', source: 'selected' }); // 重複は無視
    expect(draft().words).toHaveLength(2);
    draft().removeWord('友達');
    expect(draft().words.map((w) => w.text)).toEqual(['カフェ']);
  });

  it('reset は下書きを初期化する', () => {
    draft().setMood('嬉しかった');
    draft().setEventWord('読書');
    draft().reset();
    expect(draft().mood).toBeUndefined();
    expect(draft().words).toEqual([]);
  });
});

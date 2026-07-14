import AsyncStorage from '@react-native-async-storage/async-storage';

import { useDraftStore } from '../draftStore';

// draftStore は永続化（zustand persist → services/storage → AsyncStorage）を持つため、
// 他のローカルリポジトリ系テストと同様に AsyncStorage をモックする。
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const draft = () => useDraftStore.getState();
const eventWords = () => draft().words.filter((w) => w.category === 'event');

describe('draftStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
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

  it('起動後は hasHydrated が true になる（初回ハイドレーション完了）', async () => {
    // persist のハイドレーションは非同期（AsyncStorage 読込）のため、マイクロタスクを1つ待つ。
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(draft().hasHydrated).toBe(true);
  });

  it('AsyncStorage に保存済みの下書きが実際に復元される', async () => {
    const persistedState = {
      mood: '復元済みの気持ち',
      words: [{ text: '復元語', category: 'assoc', source: 'selected' }],
      bodyText: '復元された本文',
      awareness: '復元された気づき',
    };
    await AsyncStorage.setItem('tasogare-draft', JSON.stringify({ state: persistedState, version: 0 }));

    // 保存済みデータから明示的に再ハイドレーション（同一ストアインスタンス・同一 AsyncStorage を使うため
    // モジュール再読込は不要。persist ミドルウェアが公開する rehydrate API を使う）。
    await useDraftStore.persist.rehydrate();

    expect(draft().mood).toBe(persistedState.mood);
    expect(draft().words).toEqual(persistedState.words);
    expect(draft().bodyText).toBe(persistedState.bodyText);
    expect(draft().awareness).toBe(persistedState.awareness);
    expect(draft().hasHydrated).toBe(true);
  });

  it('変更内容がオフライン永続（AsyncStorage）に書き込まれる（constraints.md: 下書きの継続）', async () => {
    draft().setMood('もやもや');
    draft().setEventWord('カフェ');
    draft().setBodyText('下書き本文');

    // persist の書き込みも非同期のため、書き込み完了を待つ。
    await new Promise((resolve) => setTimeout(resolve, 0));

    const raw = await AsyncStorage.getItem('tasogare-draft');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as { state: Record<string, unknown> };
    expect(parsed.state.mood).toBe('もやもや');
    expect(parsed.state.words).toEqual([{ text: 'カフェ', category: 'event', source: 'selected' }]);
    expect(parsed.state.bodyText).toBe('下書き本文');
    // アクション（関数）や hasHydrated は永続化対象外（partialize）。
    expect(parsed.state.setMood).toBeUndefined();
    expect(parsed.state.hasHydrated).toBeUndefined();
  });
});

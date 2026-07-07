import type { DiaryWord, WordCategory } from '../types/diary';
import type { MoodLevel } from '../theme/colors';

// Claude 連携（api-contract.md）のクライアント側 I/F。
// 現段階は **モック実装**。実装フェーズで Firebase Functions（Callable）呼び出しに差し替える。
// I/F（request/response 形）は api-contract.md 第3章に合わせている。

// ---- 型（api-contract.md 3.1 suggestWords）----
export interface SuggestWordsRequest {
  mood?: string;
  moodEnumHint?: MoodLevel;
  events: string[];
  selected: string[];
  locale: 'ja';
}
export interface WordSuggestion {
  text: string;
  category: WordCategory;
}
export interface SuggestWordsResponse {
  suggestions: WordSuggestion[];
  promptVersion: string;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// できごとに応じた連想の種。モックの説得力付けのための簡易辞書。
const EVENT_HINTS: Record<string, string[]> = {
  カフェ: ['コーヒー', '読書', 'ひとり時間'],
  仕事: ['締め切り', '会議', '達成感'],
  友達と: ['おしゃべり', '笑った', 'ひさしぶり'],
  読書: ['物語', '静かな時間', 'コーヒー'],
  家でゆっくり: ['休息', 'ぼんやり', '安心'],
  外出: ['風', '歩いた', '気分転換'],
};

const BASE_SUGGESTIONS = ['晴れ', '頑張った', '少し我慢', '話せてよかった', 'いつもの場所', 'ひと息'];

// モック: できごと＋気持ちから連想語（assoc）を返す。
// 実サービスでは Functions がサーバ側で wordStats（過去傾向）を加味する。
export async function suggestWords(req: SuggestWordsRequest): Promise<SuggestWordsResponse> {
  await delay(600);

  const exclude = new Set<string>([...req.selected, ...req.events, ...(req.mood ? [req.mood] : [])]);
  const fromEvents = req.events.flatMap((e) => EVENT_HINTS[e] ?? []);
  const ordered = [...fromEvents, ...BASE_SUGGESTIONS];

  const seen = new Set<string>();
  const suggestions: WordSuggestion[] = [];
  for (const text of ordered) {
    if (exclude.has(text) || seen.has(text)) continue;
    seen.add(text);
    suggestions.push({ text, category: 'assoc' });
    if (suggestions.length >= 7) break;
  }

  return { suggestions, promptVersion: 'words-v1-mock' };
}

// 型の再エクスポート（呼び出し側の利便のため）。
export type { DiaryWord };

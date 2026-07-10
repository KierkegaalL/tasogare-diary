import type {
  AdjustDiaryRequest,
  AdjustDiaryResponse,
  ChatRequest,
  ChatResponse,
  DiaryWord,
  GenerateDiaryRequest,
  GenerateDiaryResponse,
  GenerateInsightRequest,
  GenerateInsightResponse,
  SuggestWordsRequest,
  SuggestWordsResponse,
  WordSuggestion,
} from './diaryApi';
import type { MoodLevel } from '../theme/colors';

// Claude 連携（api-contract.md）のクライアント側 **モック実装**。
// Firebase 未設定時（isFirebaseConfigured=false）の既定として diaryApi.ts から使う。
// I/F（request/response 形）は api-contract.md 第3章に合わせている。

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

// 気持ちの語 → 感情ラベル（enum）の推定。実サービスでは Claude が推定する（api-contract.md 3.2）。
const MOOD_ESTIMATE: Record<string, MoodLevel> = {
  疲れた: 'tender',
  もやもや: 'tender',
  なんとなく: 'tender',
  しんどい: 'heavy',
  嬉しかった: 'calm',
  穏やか: 'calm',
  ホッとした: 'calm',
};

function estimateMood(words: DiaryWord[]): MoodLevel | null {
  const moodWord = words.find((w) => w.category === 'mood')?.text;
  if (!moodWord) return null;
  return MOOD_ESTIMATE[moodWord] ?? 'tender';
}

// モック: 選択語群から日記本文＋推定感情ラベルを生成する（api-contract.md 3.2）。
export async function generateDiary(req: GenerateDiaryRequest): Promise<GenerateDiaryResponse> {
  await delay(800);

  const moodWord = req.words.find((w) => w.category === 'mood')?.text;
  const eventWord = req.words.find((w) => w.category === 'event')?.text;
  const assoc = req.words.filter((w) => w.category === 'assoc').map((w) => w.text);

  const segments: string[] = [];
  if (eventWord) segments.push(`今日は${eventWord}で過ごした`);
  if (assoc.length) segments.push(`${assoc.join('と')}が心に残っている`);
  if (moodWord) segments.push(`${moodWord}気持ちの一日だった`);

  const bodyText = segments.length > 0 ? `${segments.join('。')}。` : '静かな一日だった。';
  return { bodyText, mood: estimateMood(req.words), promptVersion: 'diary-v1-mock' };
}

// モック: 本文を調整・再生成する（api-contract.md 3.3）。mood は変更しない（呼び出し側で維持）。
export async function adjustDiary(req: AdjustDiaryRequest): Promise<AdjustDiaryResponse> {
  await delay(600);

  const trimmed = req.bodyText.replace(/。$/, '');
  let bodyText = req.bodyText;
  switch (req.instruction) {
    case 'positive':
      bodyText = `${trimmed}。それでも、悪くない一日だったと思う。`;
      break;
    case 'shorter': {
      const first = req.bodyText.split('。').filter(Boolean)[0];
      bodyText = first ? `${first}。` : req.bodyText;
      break;
    }
    case 'detailed':
      bodyText = `${trimmed}。ふとした時間に、その感覚を思い返していた。`;
      break;
  }
  return { bodyText, mood: null, promptVersion: 'adjust-v1-mock' };
}

// 寄り添い応答の候補（診断・断定はしない: constraints.md / api-contract.md 3.4）。
const CHAT_REPLIES = [
  'そう感じていたんですね。話してくれてありがとうございます。',
  'その気持ち、そのまま大切にしていいと思います。',
  '少しずつで大丈夫です。無理はしないでくださいね。',
  'そんな一日だったんですね。今は少し落ち着きましたか？',
  'よく頑張った一日でしたね。ゆっくり休めますように。',
];

// モック: その日の記録を文脈に寄り添い応答を返す（api-contract.md 3.4）。
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  await delay(700);
  const index = req.message.trim().length % CHAT_REPLIES.length;
  return { reply: CHAT_REPLIES[index] ?? CHAT_REPLIES[0]!, promptVersion: 'chat-v1-mock' };
}

// モック: 対話の最初の問いかけ（空対話時の AI 初回メッセージ）。
export async function chatOpening(ctx: {
  mood: MoodLevel | null;
  bodyText: string;
}): Promise<ChatResponse> {
  await delay(700);
  const moodPart =
    ctx.mood === 'heavy'
      ? 'しんどい一日だったんですね。'
      : ctx.mood === 'tender'
        ? '少し疲れが残る一日だったのかもしれませんね。'
        : ctx.mood === 'calm'
          ? '穏やかな時間もあった一日ですね。'
          : '';
  return {
    reply: `${moodPart}この日のこと、よかったら聞かせてください。今はどんな気持ちですか？`,
    promptVersion: 'chat-opening-v1-mock',
  };
}

const DAY_MS = 86400000;
const toDateString = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// モックの periodKey → 集計期間。実際の集計は Worker 側（worker/src/insight.ts）が行う。
function mockPeriodRange(req: GenerateInsightRequest): { rangeStart: string; rangeEnd: string } {
  if (req.type === 'monthly') {
    const [y, m] = req.periodKey.split('-');
    const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
    return { rangeStart: `${req.periodKey}-01`, rangeEnd: `${req.periodKey}-${String(lastDay).padStart(2, '0')}` };
  }
  const [y, w] = req.periodKey.split('-W');
  const jan4 = Date.UTC(Number(y), 0, 4);
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() || 7) - 1) * DAY_MS;
  const monday = week1Monday + (Number(w) - 1) * 7 * DAY_MS;
  return { rangeStart: toDateString(monday), rangeEnd: toDateString(monday + 6 * DAY_MS) };
}

// モック: 週次/月次まとめ。集計は行わず固定の傾向を返す（Worker 未設定時の見た目確認用）。
// 実サーバは entries を集計し、期間内にエントリが無ければ failed-precondition を返す。
export async function generateInsight(req: GenerateInsightRequest): Promise<GenerateInsightResponse> {
  await delay(600);
  const { rangeStart, rangeEnd } = mockPeriodRange(req);
  return {
    type: req.type,
    periodKey: req.periodKey,
    rangeStart,
    rangeEnd,
    moodDistribution: { calm: 45, tender: 35, heavy: 20 },
    topWords: [
      { word: '疲れた', count: 4 },
      { word: 'コーヒー', count: 3 },
      { word: '雨', count: 2 },
    ],
    narrative:
      'この期間は、穏やかな時間と少し疲れた時間が行き来していたようです。' +
      '「疲れた」という言葉が何度か顔を出しながらも、コーヒーの時間がそっと一息を作ってくれていました。' +
      'よく歩いた日々でしたね。',
    generatedAt: new Date().toISOString(),
    source: { model: 'mock' },
    schemaVersion: 1,
  };
}

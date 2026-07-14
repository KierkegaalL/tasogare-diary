import { verifyFirebaseIdToken, AuthError } from './auth';
import { ApiError, getLlmProvider } from './llm';
import type { LlmHistoryEntry, LlmProvider } from './llm';
import type { Env } from './env';
import { handleDeleteAccount } from './account';
import { handleGenerateInsight } from './insight';
import { handleScheduled } from './cron';
import { getEntry, queryEntriesByDateRange } from './firestore';
import type { EntrySummary } from './firestore';
import { aggregate } from './insight';
import { DAY_MS, toDateString } from './dateUtils';
import { handleCreatePairingToken, handleVerifyPairingToken } from './pairing';
import { handleMigrateToNativeAuth } from './migration';
import {
  PROMPT_VERSION,
  SYSTEM_ADJUST_DIARY,
  SYSTEM_CHAT,
  SYSTEM_CHAT_OPENING,
  SYSTEM_GENERATE_DIARY,
  SYSTEM_SUGGEST_WORDS,
} from './prompts';

// たそがれ日記 AI連携プロキシ（Cloudflare Workers 版）。
// Firebase Blaze プランを使わず、Spark プラン（Firestore/Auth のみ）を維持するための構成。
// - クライアントは Firebase ID トークンを Authorization: Bearer で送る。
// - 本 Worker がトークンを検証（jose + Google 公開鍵）→ LLM プロバイダを呼び出す。
// - API キーはクライアントに埋め込まず、Worker の Secret にのみ保持（constraints.md）。
// 注: LLM プロバイダは抽象化されており（./llm）、現在の実装は無料枠運用のため Gemini。
//     別 API（Anthropic 等）へ移管する場合は ./llm 配下にプロバイダ実装を追加するだけで、
//     本ファイル（ルーティング/バリデーション/プロンプト）は変更不要。

// ---- 型（api-contract.md 第3章。クライアント src/services/diaryApi.ts と対応）----
type MoodLevel = 'calm' | 'tender' | 'heavy';
type WordCategory = 'mood' | 'event' | 'assoc';
type ChatRole = 'ai' | 'me';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return json({ error: { code: 'unauthenticated', message: err.message } }, 401);
  }
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error('Unhandled error', (err as Error)?.name);
  return json({ error: { code: 'internal', message: '想定外のエラーが発生しました。' } }, 500);
}

// 入力サイズの上限（LLMへ任意長の入力をそのまま転送しないための防御。api-contract.md 第3章の
// 想定入力＝一言〜数文程度に対して十分な余裕を持たせつつ、トークン濫用・課金増を防ぐ）。
const MAX_TEXT_LENGTH = 2000; // メッセージ・単語等、通常の自由入力の上限
const MAX_BODY_TEXT_LENGTH = 4000; // 日記本文（生成・調整対象）の上限
const MAX_SHORT_TEXT_LENGTH = 200; // mood・moodEnumHint等、短い定型的な値の上限
const MAX_DATE_LENGTH = 32; // date（YYYY-MM-DD、10文字）に十分な余裕を持たせた上限
const MAX_ARRAY_ITEMS = 50; // events・selected・history 等の配列要素数上限
const MAX_WORDS_ITEMS = 100; // words（ことば選択）の要素数上限

function asStringArray(
  value: unknown,
  field: string,
  opts: { maxItems?: number; maxItemLength?: number } = {},
): string[] {
  const maxItems = opts.maxItems ?? MAX_ARRAY_ITEMS;
  const maxItemLength = opts.maxItemLength ?? MAX_TEXT_LENGTH;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ApiError(400, 'invalid-argument', `${field} は文字列配列である必要があります。`);
  }
  if (value.length > maxItems) {
    throw new ApiError(400, 'invalid-argument', `${field} は${maxItems}件以内である必要があります。`);
  }
  if ((value as string[]).some((v) => v.length > maxItemLength)) {
    throw new ApiError(400, 'invalid-argument', `${field} の各要素は${maxItemLength}文字以内である必要があります。`);
  }
  return value as string[];
}

function requireString(value: unknown, field: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(400, 'invalid-argument', `${field} は必須です。`);
  }
  if (value.length > maxLength) {
    throw new ApiError(400, 'invalid-argument', `${field} は${maxLength}文字以内である必要があります。`);
  }
  return value;
}

// 任意（未指定なら undefined を返す）文字列フィールド。型不一致は既存動作を踏襲し無視するが、
// 文字列として渡された場合の長さ上限は必須フィールドと同様に検証する。
function optionalString(value: unknown, field: string, maxLength = MAX_SHORT_TEXT_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length > maxLength) {
    throw new ApiError(400, 'invalid-argument', `${field} は${maxLength}文字以内である必要があります。`);
  }
  return value;
}

// words（generateDiary）・history（chat）のように「オブジェクト配列の text プロパティ」の
// 長さだけを検証したい場合の共通ヘルパー。text 以外の型不一致は個別ハンドラの責務（ここでは見ない）。
function assertMaxItemTextLength(items: unknown[], field: string, maxLength: number): void {
  const tooLong = items.some(
    (item) => typeof (item as { text?: unknown })?.text === 'string' && (item as { text: string }).text.length > maxLength,
  );
  if (tooLong) {
    throw new ApiError(400, 'invalid-argument', `${field} の各要素は${maxLength}文字以内である必要があります。`);
  }
}

// `as const` のリテラル型スキーマを LlmCallOptions.jsonSchema（Record<string, unknown>）へ渡すための
// 型ヘルパー（二重キャストの重複を1箇所に集約）。スキーマ規約は llm/types.ts を参照。
function schema(s: unknown): Record<string, unknown> {
  return s as Record<string, unknown>;
}

// ai/me（保存モデル）→ プロバイダ非依存ロール assistant/user へ写像（api-contract.md 第2章）。
// 各プロバイダが自社のロール名（例: Gemini は model/user）へ再写像する。
function toLlmHistory(history: { role: ChatRole; text: string }[]): LlmHistoryEntry[] {
  return history
    .filter((m) => typeof m?.text === 'string' && m.text.length > 0)
    .map((m) => ({
      role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
      text: m.text,
    }));
}

// ==========================================================================
// 3.1 suggestWords — 連想語提案
// ==========================================================================
const SUGGEST_WORDS_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          category: { type: 'string', enum: ['mood', 'event', 'assoc'] },
        },
        required: ['text', 'category'],
      },
    },
  },
  required: ['suggestions'],
} as const;

async function handleSuggestWords(llm: LlmProvider, data: Record<string, unknown>) {
  const events = asStringArray(data.events ?? [], 'events', { maxItems: 20, maxItemLength: MAX_SHORT_TEXT_LENGTH });
  const selected = asStringArray(data.selected ?? [], 'selected', { maxItemLength: MAX_SHORT_TEXT_LENGTH });
  const mood = optionalString(data.mood, 'mood');

  const userText = JSON.stringify({
    mood: mood ?? null,
    moodEnumHint: optionalString(data.moodEnumHint, 'moodEnumHint') ?? null,
    events,
    selected,
    instruction: '上記をふまえ、日記のきっかけになる連想語を最大7語、重複なく提案してください。',
  });

  const parsed = await llm.callJson<{ suggestions: { text: string; category: WordCategory }[] }>({
    purpose: 'interactive',
    system: SYSTEM_SUGGEST_WORDS,
    userText,
    maxTokens: 512,
    jsonSchema: schema(SUGGEST_WORDS_SCHEMA),
  });

  return { suggestions: parsed.suggestions ?? [], promptVersion: PROMPT_VERSION.suggestWords };
}

// ==========================================================================
// 3.2 generateDiary — 日記文生成
// ==========================================================================
const GENERATE_DIARY_SCHEMA = {
  type: 'object',
  properties: {
    bodyText: { type: 'string' },
    // nullable は OpenAPI 3.0 風の `nullable: true` で表現する（llm/types.ts のスキーマ規約）。
    // 各プロバイダが自社の構造化出力形式へ変換する（Gemini はそのまま responseSchema に渡せる）。
    mood: { type: 'string', enum: ['calm', 'tender', 'heavy'], nullable: true },
  },
  required: ['bodyText', 'mood'],
} as const;

// テストのため export（insight.ts の handleGenerateInsight と同様の方針）。
export async function handleGenerateDiary(llm: LlmProvider, data: Record<string, unknown>) {
  const words = data.words;
  if (!Array.isArray(words) || words.length === 0) {
    throw new ApiError(400, 'invalid-argument', 'words は必須です。');
  }
  if (words.length > MAX_WORDS_ITEMS) {
    throw new ApiError(400, 'invalid-argument', `words は${MAX_WORDS_ITEMS}件以内である必要があります。`);
  }
  assertMaxItemTextLength(words, 'words', MAX_SHORT_TEXT_LENGTH);
  const date = requireString(data.date, 'date', MAX_DATE_LENGTH);

  const userText = JSON.stringify({
    words,
    date,
    instruction: '上記の言葉から日記本文（2〜3文）と感情ラベルを生成してください。',
  });

  const parsed = await llm.callJson<{ bodyText: string; mood: MoodLevel | null }>({
    purpose: 'generate',
    system: SYSTEM_GENERATE_DIARY,
    userText,
    maxTokens: 1024,
    jsonSchema: schema(GENERATE_DIARY_SCHEMA),
  });

  return {
    bodyText: parsed.bodyText ?? '',
    mood: parsed.mood ?? null,
    promptVersion: PROMPT_VERSION.generateDiary,
    // 保存時に entries.source.model として追跡できるよう、実際に使ったモデルIDを返す（api-contract.md 第8章）。
    model: llm.modelFor('generate'),
  };
}

// ==========================================================================
// 3.3 adjustDiary — 調整・再生成
// ==========================================================================
type AdjustInstruction = 'positive' | 'shorter' | 'detailed';

const ADJUST_DIARY_SCHEMA = {
  type: 'object',
  properties: { bodyText: { type: 'string' } },
  required: ['bodyText'],
} as const;

// テストのため export（insight.ts の handleGenerateInsight と同様の方針）。
export async function handleAdjustDiary(llm: LlmProvider, data: Record<string, unknown>) {
  const bodyText = requireString(data.bodyText, 'bodyText', MAX_BODY_TEXT_LENGTH);
  const instruction = data.instruction as AdjustInstruction;
  if (!['positive', 'shorter', 'detailed'].includes(instruction)) {
    throw new ApiError(400, 'invalid-argument', 'instruction が不正です。');
  }

  const label =
    instruction === 'positive' ? 'もっと前向きに' : instruction === 'shorter' ? '短く' : '詳しく';
  const userText = JSON.stringify({
    bodyText,
    instruction,
    request: `次の日記本文を「${label}」書き直してください。`,
  });

  const parsed = await llm.callJson<{ bodyText: string }>({
    purpose: 'interactive',
    system: SYSTEM_ADJUST_DIARY,
    userText,
    maxTokens: 1024,
    jsonSchema: schema(ADJUST_DIARY_SCHEMA),
  });

  // mood は調整では再推定しない（クライアントが既存の mood を維持する）。
  return {
    bodyText: parsed.bodyText ?? bodyText,
    mood: null,
    promptVersion: PROMPT_VERSION.adjustDiary,
    model: llm.modelFor('interactive'),
  };
}

// ==========================================================================
// 3.4 chat — AI対話
// ==========================================================================

// 関連する過去エントリの「要約」補完（api-contract.md 3.4 備考・第10章）。
// 日記本文そのものは送らず、insight.ts と同じ集計値（気分割合・頻出語）のみを渡す
// （最小送信の原則、第8章）。過去何日をどう見るかは要件未確定のため、ここで既定値を決め打つ。
const CHAT_TREND_WINDOW_DAYS = 14; // 直近2週間（当日を含まない）。
const CHAT_TREND_MIN_ENTRIES = 3; // これ未満は傾向として提示しない（データが乏しく偏りが大きいため）。
const CHAT_TREND_TOP_WORDS = 5; // system プロンプトに含める語数の上限（トークン節約。集計自体はaggregateの上限=10のまま）。

const MOOD_LABEL_JA: Record<MoodLevel, string> = { calm: '穏やか', tender: 'ゆらぎ', heavy: '重い' };

function buildPastTrendNote(entries: EntrySummary[]): string | null {
  if (entries.length < CHAT_TREND_MIN_ENTRIES) return null;
  const { moodDistribution, topWords } = aggregate(entries);

  // 全件 mood:null（気分をスキップした日ばかり）だと moodDistribution は
  // { calm: 0, tender: 0, heavy: 0 }（合計0%）になる。本来100%になるべき割合が
  // 合計0%で出てくるのは不自然なため、気分データが1件も無い場合は moodPart 自体を省略する。
  // toPercentDistribution（insight.ts）は「1件でもあれば必ず合計100、無ければ全0」という性質を
  // 持つため、entries を再走査せず合計値だけで判定できる。
  const hasMoodData = moodDistribution.calm + moodDistribution.tender + moodDistribution.heavy > 0;
  const moodPart = hasMoodData
    ? (['calm', 'tender', 'heavy'] as const).map((m) => `${MOOD_LABEL_JA[m]}${moodDistribution[m]}%`).join('／')
    : null;
  const wordsPart = topWords
    .slice(0, CHAT_TREND_TOP_WORDS)
    .map((w) => w.word)
    .join('、');

  // どちらの材料も無ければ、傾向ノート自体を付与しない。
  if (!moodPart && !wordsPart) return null;

  const header = `直近${CHAT_TREND_WINDOW_DAYS}日間（${entries.length}件）の傾向: `;
  const moodSentence = moodPart ? `${moodPart}。` : '';
  const wordsSentence = wordsPart ? `よく出た言葉: ${wordsPart}。` : '';
  return `${header}${moodSentence}${wordsSentence}`;
}

// テストのため export（insight.ts の handleGenerateInsight と同様の方針）。
export async function handleChat(env: Env, llm: LlmProvider, uid: string, data: Record<string, unknown>) {
  const message = requireString(data.message, 'message');
  const rawHistory = Array.isArray(data.history) ? data.history : [];
  if (rawHistory.length > MAX_ARRAY_ITEMS) {
    throw new ApiError(400, 'invalid-argument', `history は${MAX_ARRAY_ITEMS}件以内である必要があります。`);
  }
  assertMaxItemTextLength(rawHistory, 'history', MAX_TEXT_LENGTH);
  const history = toLlmHistory(rawHistory as { role: ChatRole; text: string }[]);

  // 当該エントリ本文のサーバ側文脈補完（api-contract.md 3.4 備考）。
  // クライアント履歴（直近 N 往復）だけに頼ると、対話が長くなり履歴が切り詰められた際に
  // この日の感情・本文という土台が失われるため、entryId から都度サーバ側で補う。
  // entryId 不正・エントリ削除済み等（getEntry が null）は文脈補完なしにフォールバックする
  // （必須情報ではないため、取得失敗で対話自体を止めない）。
  const entryId = optionalString(data.entryId, 'entryId');
  const entry = entryId
    ? await getEntry(env, uid, entryId).catch((err: unknown) => {
        console.warn('getEntry failed, falling back', (err as Error)?.name);
        return null;
      })
    : null;
  let system = entry
    ? `${SYSTEM_CHAT}\n\nこの日の記録: 感情=${entry.mood ?? '不明'}／本文「${entry.bodyText}」`
    : SYSTEM_CHAT;

  // 過去の傾向は、当該エントリの日付を起点に直近N日（当日は含まない）の集計値のみを付与する。
  // entry が無い（entryId未指定・不正・取得失敗）場合は基準日が無いため付与しない。
  if (entry) {
    const entryDateMs = Date.parse(`${entry.date}T00:00:00Z`);
    if (!Number.isNaN(entryDateMs)) {
      const rangeEndMs = entryDateMs - DAY_MS;
      const rangeStartMs = rangeEndMs - (CHAT_TREND_WINDOW_DAYS - 1) * DAY_MS;
      const pastEntries = await queryEntriesByDateRange(
        env,
        uid,
        toDateString(rangeStartMs),
        toDateString(rangeEndMs),
      ).catch((err: unknown) => {
        console.warn('queryEntriesByDateRange failed for chat trend, skipping', (err as Error)?.name);
        return [] as EntrySummary[];
      });
      const trendNote = buildPastTrendNote(pastEntries);
      if (trendNote) system += `\n\n${trendNote}`;
    }
  }

  const reply = await llm.callText({
    purpose: 'interactive',
    system,
    history,
    userText: message,
    maxTokens: 512,
  });

  return { reply, promptVersion: PROMPT_VERSION.chat };
}

// ==========================================================================
// 3.4 chatOpening — 初回問いかけ
// ==========================================================================
// handleChat と同じ理由（api-contract.md 3.4 備考）でサーバ側再取得を優先する。
// entryId から取得できればそれを正とし、クライアント送信の mood/bodyText は
// entryId 不正・エントリ削除済み等（getEntry が null）の場合のみフォールバックとして使う
// （クライアントは自分の日記データしか持てないため実害は小さいが、handleChat との非対称を
// 解消し取得経路を揃える。reviewer所見）。
// テストのため export（handleChat と同様の方針）。
export async function handleChatOpening(env: Env, llm: LlmProvider, uid: string, data: Record<string, unknown>) {
  const entryId = optionalString(data.entryId, 'entryId');
  const entry = entryId
    ? await getEntry(env, uid, entryId).catch((err: unknown) => {
        console.warn('getEntry failed, falling back', (err as Error)?.name);
        return null;
      })
    : null;
  const mood = entry ? entry.mood : (optionalString(data.mood, 'mood') ?? null);
  const bodyText = entry ? entry.bodyText : (optionalString(data.bodyText, 'bodyText', MAX_BODY_TEXT_LENGTH) ?? '');

  const userText = JSON.stringify({
    mood,
    bodyText,
    instruction: 'この日のエントリをふまえ、対話の最初の問いかけを1〜2文で生成してください。',
  });

  const reply = await llm.callText({
    purpose: 'interactive',
    system: SYSTEM_CHAT_OPENING,
    userText,
    maxTokens: 256,
  });

  return { reply, promptVersion: PROMPT_VERSION.chatOpening };
}

// ルート定義。requireAuth=true は Firebase ID トークン検証で uid を確立する。
// uid は認証済みルートでのみ非 null（verifyPairingToken は未サインイン可のため null）。
interface Route {
  requireAuth: boolean;
  handler: (env: Env, uid: string | null, data: Record<string, unknown>) => Promise<unknown>;
}

// LLM ルートは env からプロバイダを解決して既存ハンドラへ委譲する。
function llmRoute(
  handler: (llm: LlmProvider, data: Record<string, unknown>) => Promise<unknown>,
): Route {
  return { requireAuth: true, handler: (env, _uid, data) => handler(getLlmProvider(env), data) };
}

const ROUTES: Record<string, Route> = {
  '/suggestWords': llmRoute(handleSuggestWords),
  '/generateDiary': llmRoute(handleGenerateDiary),
  '/adjustDiary': llmRoute(handleAdjustDiary),
  // chat は文脈補完（getEntry）のため env・uid も使う（generateInsight と同様の理由）。
  '/chat': {
    requireAuth: true,
    handler: (env, uid, data) => handleChat(env, getLlmProvider(env), uid as string, data),
  },
  // chatOpening も同様に文脈補完（getEntry）のため env・uid を使う（handleChat と経路を統一）。
  '/chatOpening': {
    requireAuth: true,
    handler: (env, uid, data) => handleChatOpening(env, getLlmProvider(env), uid as string, data),
  },
  // 週次/月次まとめ。LLM と uid（Firestore の集計・キャッシュ）の両方を使う。
  '/generateInsight': {
    requireAuth: true,
    handler: (env, uid, data) => handleGenerateInsight(env, getLlmProvider(env), uid as string, data),
  },
  // QRペアリング（LLM 非依存）。
  '/createPairingToken': {
    requireAuth: true,
    // requireAuth=true のため uid は非 null（下の fetch で保証）。
    handler: (env, uid, _data) => handleCreatePairingToken(env, uid as string),
  },
  '/verifyPairingToken': {
    requireAuth: false, // Web 初回は未サインインで照合する（api-contract 5.2）。
    handler: (env, _uid, data) => handleVerifyPairingToken(env, data),
  },
  // ネイティブ移行ブリッジ（migration.ts / docs/migration-react-native-firebase.md 第4章）。
  // 本人の ID トークンで確立した uid に対し、同一 uid のカスタムトークンを発行する。
  '/migrateToNativeAuth': {
    requireAuth: true,
    handler: (env, uid, _data) => handleMigrateToNativeAuth(env, uid as string),
  },
  // アカウント削除（api-contract 第6章）。本人の ID トークンで uid を確定してから消す。
  '/deleteAccount': {
    requireAuth: true,
    handler: (env, uid, _data) => handleDeleteAccount(env, uid as string),
  },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const route = ROUTES[url.pathname];
    if (!route) {
      return json({ error: { code: 'internal', message: 'not found' } }, 404);
    }
    if (request.method !== 'POST') {
      return json({ error: { code: 'invalid-argument', message: 'POST のみ対応しています。' } }, 405);
    }

    try {
      let uid: string | null = null;
      if (route.requireAuth) {
        uid = await verifyFirebaseIdToken(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID);
      }

      let data: Record<string, unknown>;
      try {
        data = ((await request.json()) ?? {}) as Record<string, unknown>;
      } catch {
        throw new ApiError(400, 'invalid-argument', 'リクエスト本文が不正な JSON です。');
      }

      const result = await route.handler(env, uid, data);
      return json(result);
    } catch (err) {
      return errorResponse(err);
    }
  },

  // Cron Triggers（wrangler.jsonc の triggers.crons）による insights 事前生成（cron.ts）。
  // fetch と違いユーザーへの応答は無い。handleScheduled 内で1ユーザー・1タイプ単位の失敗は
  // 握りつぶすため、ここまで伝播するのは致命的な例外のみ。waitUntil で完了まで実行を保証する。
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env, controller.scheduledTime));
  },
};

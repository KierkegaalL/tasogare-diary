import { verifyFirebaseIdToken, AuthError } from './auth';
import { ApiError, callJson, callText, modelGenerate, modelInteractive } from './llm';
import type { Env, GeminiHistoryEntry } from './llm';
import {
  PROMPT_VERSION,
  SYSTEM_ADJUST_DIARY,
  SYSTEM_CHAT,
  SYSTEM_CHAT_OPENING,
  SYSTEM_GENERATE_DIARY,
  SYSTEM_SUGGEST_WORDS,
} from './prompts';

// たそがれ日記 Claude 連携プロキシ（Cloudflare Workers 版）。
// Firebase Blaze プランを使わず、Spark プラン（Firestore/Auth のみ）を維持するための構成。
// - クライアントは Firebase ID トークンを Authorization: Bearer で送る。
// - 本 Worker がトークンを検証（jose + Google 公開鍵）→ LLM（現在は Gemini）を呼び出す。
// - API キーはクライアントに埋め込まず、Worker の Secret にのみ保持（constraints.md）。
// 注: LLM プロバイダは無料枠運用のため Gemini を採用（./llm.ts）。将来 Anthropic 等へ戻す場合は
//     llm.ts の実装のみ差し替えれば、本ファイルのルーティング/エラー処理は変更不要。

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

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ApiError(400, 'invalid-argument', `${field} は文字列配列である必要があります。`);
  }
  return value as string[];
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(400, 'invalid-argument', `${field} は必須です。`);
  }
  return value;
}

// ai/me（保存モデル）→ Gemini の model/user へ写像（api-contract.md 第2章）。
function toGeminiHistory(history: { role: ChatRole; text: string }[]): GeminiHistoryEntry[] {
  return history
    .filter((m) => typeof m?.text === 'string' && m.text.length > 0)
    .map((m) => ({
      role: m.role === 'ai' ? ('model' as const) : ('user' as const),
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

async function handleSuggestWords(env: Env, data: Record<string, unknown>) {
  const events = asStringArray(data.events ?? [], 'events');
  const selected = asStringArray(data.selected ?? [], 'selected');
  const mood = typeof data.mood === 'string' ? data.mood : undefined;

  const userText = JSON.stringify({
    mood: mood ?? null,
    moodEnumHint: typeof data.moodEnumHint === 'string' ? data.moodEnumHint : null,
    events,
    selected,
    instruction: '上記をふまえ、日記のきっかけになる連想語を最大7語、重複なく提案してください。',
  });

  const parsed = await callJson<{ suggestions: { text: string; category: WordCategory }[] }>(env, {
    model: modelInteractive(env),
    system: SYSTEM_SUGGEST_WORDS,
    userText,
    maxTokens: 512,
    jsonSchema: SUGGEST_WORDS_SCHEMA as unknown as Record<string, unknown>,
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
    // Gemini の responseSchema は type を配列（["string","null"]）にできないため、
    // 単一 type + nullable: true で表現する（api-contract.md 第2章）。
    mood: { type: 'string', enum: ['calm', 'tender', 'heavy'], nullable: true },
  },
  required: ['bodyText', 'mood'],
} as const;

async function handleGenerateDiary(env: Env, data: Record<string, unknown>) {
  const words = data.words;
  if (!Array.isArray(words) || words.length === 0) {
    throw new ApiError(400, 'invalid-argument', 'words は必須です。');
  }
  const date = requireString(data.date, 'date');

  const userText = JSON.stringify({
    words,
    date,
    instruction: '上記の言葉から日記本文（2〜3文）と感情ラベルを生成してください。',
  });

  const parsed = await callJson<{ bodyText: string; mood: MoodLevel | null }>(env, {
    model: modelGenerate(env),
    system: SYSTEM_GENERATE_DIARY,
    userText,
    maxTokens: 1024,
    jsonSchema: GENERATE_DIARY_SCHEMA as unknown as Record<string, unknown>,
  });

  return {
    bodyText: parsed.bodyText ?? '',
    mood: parsed.mood ?? null,
    promptVersion: PROMPT_VERSION.generateDiary,
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

async function handleAdjustDiary(env: Env, data: Record<string, unknown>) {
  const bodyText = requireString(data.bodyText, 'bodyText');
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

  const parsed = await callJson<{ bodyText: string }>(env, {
    model: modelInteractive(env),
    system: SYSTEM_ADJUST_DIARY,
    userText,
    maxTokens: 1024,
    jsonSchema: ADJUST_DIARY_SCHEMA as unknown as Record<string, unknown>,
  });

  // mood は調整では再推定しない（クライアントが既存の mood を維持する）。
  return { bodyText: parsed.bodyText ?? bodyText, mood: null, promptVersion: PROMPT_VERSION.adjustDiary };
}

// ==========================================================================
// 3.4 chat — AI対話
// ==========================================================================
async function handleChat(env: Env, data: Record<string, unknown>) {
  const message = requireString(data.message, 'message');
  const rawHistory = Array.isArray(data.history) ? data.history : [];
  const history = toGeminiHistory(rawHistory as { role: ChatRole; text: string }[]);

  // 注: 当該エントリ本文・過去要約のサーバ補完（api-contract.md 3.4 備考）は将来対応。
  // 現段階はクライアントから渡る直近履歴＋メッセージのみを最小送信する（第8章）。
  const reply = await callText(env, {
    model: modelInteractive(env),
    system: SYSTEM_CHAT,
    history,
    userText: message,
    maxTokens: 512,
  });

  return { reply, promptVersion: PROMPT_VERSION.chat };
}

// ==========================================================================
// 3.4 chatOpening — 初回問いかけ
// ==========================================================================
async function handleChatOpening(env: Env, data: Record<string, unknown>) {
  const mood = typeof data.mood === 'string' ? data.mood : null;
  const bodyText = typeof data.bodyText === 'string' ? data.bodyText : '';

  const userText = JSON.stringify({
    mood,
    bodyText,
    instruction: 'この日のエントリをふまえ、対話の最初の問いかけを1〜2文で生成してください。',
  });

  const reply = await callText(env, {
    model: modelInteractive(env),
    system: SYSTEM_CHAT_OPENING,
    userText,
    maxTokens: 256,
  });

  return { reply, promptVersion: PROMPT_VERSION.chatOpening };
}

const ROUTES: Record<string, (env: Env, data: Record<string, unknown>) => Promise<unknown>> = {
  '/suggestWords': handleSuggestWords,
  '/generateDiary': handleGenerateDiary,
  '/adjustDiary': handleAdjustDiary,
  '/chat': handleChat,
  '/chatOpening': handleChatOpening,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];
    if (!handler) {
      return json({ error: { code: 'internal', message: 'not found' } }, 404);
    }
    if (request.method !== 'POST') {
      return json({ error: { code: 'invalid-argument', message: 'POST のみ対応しています。' } }, 405);
    }

    try {
      const uid = await verifyFirebaseIdToken(request.headers.get('Authorization'), env.FIREBASE_PROJECT_ID);
      void uid; // 現段階は認証（uid 確立）のみ利用。将来 wordStats 等の uid スコープ処理に使う。

      let data: Record<string, unknown>;
      try {
        data = ((await request.json()) ?? {}) as Record<string, unknown>;
      } catch {
        throw new ApiError(400, 'invalid-argument', 'リクエスト本文が不正な JSON です。');
      }

      const result = await handler(env, data);
      return json(result);
    } catch (err) {
      return errorResponse(err);
    }
  },
};

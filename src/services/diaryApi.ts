import type { ChatRole, DiaryWord, WordCategory } from '../types/diary';
import type { MoodLevel } from '../theme/colors';
import { isClaudeWorkerConfigured } from './claudeWorker/config';
import * as mockApi from './diaryApi.mock';

// Claude 連携（api-contract.md）のクライアント側 I/F。
// - 型（request/response 形）は api-contract.md 第3章に合わせる。
// - 実装は Cloudflare Worker（Claude 連携プロキシ）の設定有無で切替える:
//     未設定 → モック（diaryApi.mock.ts、ローカル完結）
//     設定済 → Cloudflare Worker 経由の Claude 実接続（diaryApi.functions.ts）
//   Firebase Blaze プランを使わず Spark プランを維持するため、Firebase Functions ではなく
//   Cloudflare Workers 上のプロキシを利用する（environments.md）。呼び出しには Firebase ID
//   トークンを使うため、Worker 利用時は isFirebaseConfigured も併せて true である前提。
//   Worker 実装は firestore 同様、設定時のみ lazy-require する（未設定時に fetch 経路を読み込まない）。

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

// ---- 型（api-contract.md 3.2 generateDiary / 3.3 adjustDiary）----
export interface GenerateDiaryRequest {
  words: DiaryWord[];
  date: string; // YYYY-MM-DD
  locale: 'ja';
}
export interface GenerateDiaryResponse {
  bodyText: string;
  mood: MoodLevel | null;
  promptVersion: string;
}
export type AdjustInstruction = 'positive' | 'shorter' | 'detailed';
export interface AdjustDiaryRequest {
  bodyText: string;
  instruction: AdjustInstruction;
  locale: 'ja';
}
export type AdjustDiaryResponse = GenerateDiaryResponse;

// ---- 型（api-contract.md 3.4 chat）----
export interface ChatMessageIO {
  role: ChatRole;
  text: string;
}
export interface ChatRequest {
  entryId: string;
  message: string;
  history: ChatMessageIO[];
}
export interface ChatResponse {
  reply: string;
  promptVersion: string;
}

// Worker 実装は設定時のみ読み込む（未設定時は fetch 経路をバンドル/実行しない）。
function workerApi(): typeof import('./diaryApi.functions') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./diaryApi.functions') as typeof import('./diaryApi.functions');
}

// ---- 公開関数（呼び出し側の I/F は不変。内部で mock / Worker を切替）----
export function suggestWords(req: SuggestWordsRequest): Promise<SuggestWordsResponse> {
  return isClaudeWorkerConfigured ? workerApi().suggestWords(req) : mockApi.suggestWords(req);
}

export function generateDiary(req: GenerateDiaryRequest): Promise<GenerateDiaryResponse> {
  return isClaudeWorkerConfigured ? workerApi().generateDiary(req) : mockApi.generateDiary(req);
}

export function adjustDiary(req: AdjustDiaryRequest): Promise<AdjustDiaryResponse> {
  return isClaudeWorkerConfigured ? workerApi().adjustDiary(req) : mockApi.adjustDiary(req);
}

export function chat(req: ChatRequest): Promise<ChatResponse> {
  return isClaudeWorkerConfigured ? workerApi().chat(req) : mockApi.chat(req);
}

export function chatOpening(ctx: {
  mood: MoodLevel | null;
  bodyText: string;
}): Promise<ChatResponse> {
  return isClaudeWorkerConfigured ? workerApi().chatOpening(ctx) : mockApi.chatOpening(ctx);
}

// 型の再エクスポート（呼び出し側の利便のため）。
export type { DiaryWord };

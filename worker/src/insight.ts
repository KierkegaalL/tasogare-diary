import { ApiError } from './llm';
import type { LlmProvider } from './llm';
import type { Env } from './env';
import { getInsight, queryEntriesByDateRange, saveInsight } from './firestore';
import type { EntrySummary, InsightDoc } from './firestore';
import { SYSTEM_GENERATE_INSIGHT } from './prompts';

// generateInsight — 週次/月次/過去3ヶ月まとめ（api-contract.md 3.5 / data.md 3.5）。
// 方式は basic-design.md 4.3 の「案B: サーバで集計・キャッシュし、LLM で文章化」。
// - 集計は Firestore の entries から算出する（wordStats は Cloud Functions 前提の集計先で未運用のため参照しない）。
// - LLM へ渡すのは集計値のみ。日記本文は送らない（最小送信、constraints.md / api-contract.md 第8章）。
// - 結果は users/{uid}/insights/{periodId} にキャッシュする（クライアントは書けないため Admin 経由）。
// - 定期バッチ（Cron Triggers）での事前生成は未実装。本エンドポイントは表示時オンデマンド生成を担う。

// quarterly は「過去3ヶ月」（screen.md 4.1）。periodKey は monthly と同じ YYYY-MM で
// 末尾の月（＝今月）を表し、その月を含む直近3ヶ月を集計する（暦上の四半期ではない）。
export type InsightType = 'weekly' | 'monthly' | 'quarterly';
export type MoodLevel = 'calm' | 'tender' | 'heavy';

const MOODS: readonly MoodLevel[] = ['calm', 'tender', 'heavy'] as const;
const SCHEMA_VERSION = 1;
const TOP_WORDS_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// 期間が未確定（今週/今月）の間のキャッシュ有効期間。確定後は永続キャッシュ。
const ONGOING_CACHE_TTL_MS = 60 * 60 * 1000;

// ---- 期間キー → 集計範囲 ----

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const WEEKLY_KEY = /^(\d{4})-W(\d{2})$/;
const MONTHLY_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

// ISO8601 週（月曜始まり）。1月4日は必ずその年の第1週に含まれる、という定義から週頭を求める。
function weeklyRange(periodKey: string): { rangeStart: string; rangeEnd: string } {
  const m = WEEKLY_KEY.exec(periodKey);
  if (!m) {
    throw new ApiError(400, 'invalid-argument', 'periodKey は "YYYY-Www"（例: 2026-W27）形式で指定してください。');
  }
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) {
    throw new ApiError(400, 'invalid-argument', 'periodKey の週番号が不正です。');
  }

  const jan4 = Date.UTC(year, 0, 4);
  const jan4Dow = new Date(jan4).getUTCDay() || 7; // 1(月)..7(日)
  const week1Monday = jan4 - (jan4Dow - 1) * DAY_MS;
  const monday = week1Monday + (week - 1) * 7 * DAY_MS;

  // 第53週が存在しない年もある。ISO 週の年は「その週の木曜日が属する年」で決まる。
  const thursday = monday + 3 * DAY_MS;
  if (new Date(thursday).getUTCFullYear() !== year) {
    throw new ApiError(400, 'invalid-argument', `${year} 年に第 ${week} 週は存在しません。`);
  }

  return { rangeStart: toDateString(monday), rangeEnd: toDateString(monday + 6 * DAY_MS) };
}

// month（1-12）の末日を YYYY-MM-DD で返す。Date.UTC(year, month, 0) は「month 月の 0 日」＝
// 前月末日 → month 月の日数。
function monthEnd(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad2(month)}-${pad2(lastDay)}`;
}

function monthlyRange(periodKey: string): { rangeStart: string; rangeEnd: string } {
  const m = MONTHLY_KEY.exec(periodKey);
  if (!m) {
    throw new ApiError(400, 'invalid-argument', 'periodKey は "YYYY-MM"（例: 2026-07）形式で指定してください。');
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  return { rangeStart: `${year}-${pad2(month)}-01`, rangeEnd: monthEnd(year, month) };
}

// 過去3ヶ月（screen.md 4.1）。periodKey は末尾の月（YYYY-MM）で、その月を含む直近3ヶ月
// （末尾月とその前2ヶ月）を範囲にする。年跨ぎ（例: 2026-02 → 2025-12〜2026-02）も Date.UTC の
// 月インデックス正規化で扱える。
function quarterlyRange(periodKey: string): { rangeStart: string; rangeEnd: string } {
  const m = MONTHLY_KEY.exec(periodKey);
  if (!m) {
    throw new ApiError(400, 'invalid-argument', 'periodKey は "YYYY-MM"（例: 2026-07）形式で指定してください。');
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  // 開始月＝末尾月の2ヶ月前。month は1始まりなので月インデックスは month-1、そこから2引く。
  const start = new Date(Date.UTC(year, month - 1 - 2, 1));
  const rangeStart = `${start.getUTCFullYear()}-${pad2(start.getUTCMonth() + 1)}-01`;
  return { rangeStart, rangeEnd: monthEnd(year, month) };
}

export function periodRange(type: InsightType, periodKey: string): { rangeStart: string; rangeEnd: string } {
  switch (type) {
    case 'weekly':
      return weeklyRange(periodKey);
    case 'monthly':
      return monthlyRange(periodKey);
    case 'quarterly':
      return quarterlyRange(periodKey);
  }
}

// ---- 集計 ----

function isMoodLevel(value: string | null): value is MoodLevel {
  return value !== null && (MOODS as readonly string[]).includes(value);
}

// 感情の件数を合計100の百分率へ。端数は最大剰余法で配分し、必ず合計100にする（mood が null の日は母数から除く）。
function toPercentDistribution(counts: Record<MoodLevel, number>): Record<MoodLevel, number> {
  const total = MOODS.reduce((sum, mood) => sum + counts[mood], 0);
  if (total === 0) return { calm: 0, tender: 0, heavy: 0 };

  const shares = MOODS.map((mood, index) => {
    const exact = (counts[mood] * 100) / total;
    const floor = Math.floor(exact);
    return { mood, index, floor, remainder: exact - floor };
  });

  let leftover = 100 - shares.reduce((sum, s) => sum + s.floor, 0);
  // 端数が大きい順（同率なら MOODS の並び順）に 1 ずつ配る。
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const share of ranked) {
    if (leftover <= 0) break;
    share.floor += 1;
    leftover -= 1;
  }

  return {
    calm: shares[0].floor,
    tender: shares[1].floor,
    heavy: shares[2].floor,
  };
}

export interface Aggregation {
  moodDistribution: Record<MoodLevel, number>;
  topWords: { word: string; count: number }[];
}

export function aggregate(entries: EntrySummary[]): Aggregation {
  const counts: Record<MoodLevel, number> = { calm: 0, tender: 0, heavy: 0 };
  const wordCounts = new Map<string, number>();

  for (const entry of entries) {
    if (isMoodLevel(entry.mood)) counts[entry.mood] += 1;
    // 同一エントリ内の重複語は1回として数える（同じ日に同じ語を重ねて選べるため）。
    for (const text of new Set(entry.words.map((w) => w.text))) {
      wordCounts.set(text, (wordCounts.get(text) ?? 0) + 1);
    }
  }

  const topWords = [...wordCounts.entries()]
    .map(([word, count]) => ({ word, count }))
    // 件数降順 → 同数は語の昇順（安定した並びにして再生成時のブレを避ける）。
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, TOP_WORDS_LIMIT);

  return { moodDistribution: toPercentDistribution(counts), topWords };
}

// ---- キャッシュ鮮度 ----

// 期間が完全に過ぎていれば内容は変わらないので永続キャッシュ。進行中なら TTL で作り直す。
//
// entries.date は「端末ローカル日付」（src/utils/date.ts の todayISO）だが Worker には UTC しか無い。
// UTC より遅れたタイムゾーン（負オフセット、例: 米州）では、ユーザーがまだ期間最終日にいるのに
// UTC 側だけ翌日へ進む。そこで素朴に `rangeEnd < 今日(UTC)` で確定扱いにすると、その日の分の
// エントリが恒久キャッシュに取り込まれないまま二度と反映されなくなる。
// これを避けるため、確定判定に猶予を置く（最大オフセット差 UTC-12 を吸収する）。
// 日付へ丸めてから比較するため実際の猶予は1日以上（最大2日弱）になるが、短くはならない。
// 猶予中は下の TTL 判定にかかるので、遅くとも1時間で作り直される。
const PERIOD_CLOSE_GRACE_MS = DAY_MS;

export function isCacheFresh(cached: InsightDoc, rangeEnd: string, now: number = Date.now()): boolean {
  if (rangeEnd < toDateString(now - PERIOD_CLOSE_GRACE_MS)) return true;
  const age = now - new Date(cached.generatedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < ONGOING_CACHE_TTL_MS;
}

// ---- ハンドラ ----

export async function handleGenerateInsight(
  env: Env,
  llm: LlmProvider,
  uid: string,
  data: Record<string, unknown>,
): Promise<InsightDoc> {
  const type = data.type;
  if (type !== 'weekly' && type !== 'monthly' && type !== 'quarterly') {
    throw new ApiError(400, 'invalid-argument', 'type は weekly / monthly / quarterly を指定してください。');
  }
  const periodKey = data.periodKey;
  if (typeof periodKey !== 'string' || periodKey.length === 0) {
    throw new ApiError(400, 'invalid-argument', 'periodKey は必須です。');
  }

  const { rangeStart, rangeEnd } = periodRange(type, periodKey);
  const periodId = `${type}_${periodKey}`; // data.md 3.5

  const cached = await getInsight(env, uid, periodId);
  if (cached && isCacheFresh(cached, rangeEnd)) return cached;

  const entries = await queryEntriesByDateRange(env, uid, rangeStart, rangeEnd);
  if (entries.length === 0) {
    throw new ApiError(400, 'failed-precondition', 'この期間の日記がまだありません。');
  }

  const { moodDistribution, topWords } = aggregate(entries);

  // 送るのは集計値のみ（本文なし）。
  const userText = JSON.stringify({
    type,
    periodKey,
    rangeStart,
    rangeEnd,
    entryCount: entries.length,
    moodDistribution,
    topWords,
    instruction: 'この集計をふまえ、期間のふりかえりのまとめ文を3〜4文で書いてください。',
  });

  const narrative = await llm.callText({
    purpose: 'generate',
    system: SYSTEM_GENERATE_INSIGHT,
    userText,
    maxTokens: 1024,
  });

  const doc: InsightDoc = {
    type,
    periodKey,
    rangeStart,
    rangeEnd,
    moodDistribution,
    topWords,
    narrative,
    generatedAt: new Date().toISOString(),
    source: { model: llm.modelFor('generate') },
    schemaVersion: SCHEMA_VERSION,
  };

  await saveInsight(env, uid, periodId, doc);
  return doc;
}

import { ApiError, getLlmProvider } from './llm';
import type { Env } from './env';
import { handleGenerateInsight } from './insight';
import type { InsightType } from './insight';
import { listUserIds } from './firestore';
import { DAY_MS, pad2 } from './dateUtils';

// Cron Triggers による insights 事前生成（api-contract.md 3.5 / §10・worker/README.md）。
//
// 目的: Web ダッシュボード表示時のオンデマンド生成待ちをなくすため、現在期間の
//       weekly/monthly まとめをユーザーごとに事前生成し、キャッシュ（users/{uid}/insights）を温める。
//
// 位置づけ: あくまで best-effort のキャッシュ温め。**オンデマンド生成
//   （handleGenerateInsight）が正**であり、全ユーザー・全期間を網羅する。cron が拾えなかった
//   ユーザー（下記の上限超過分・新規ユーザー等）も、ダッシュボード表示時に生成される。
//
// コスト/権限設計（docs で「要検討」とされていた点への回答）:
// - 全ユーザー列挙は users コレクションを list documents（__name__ のみ・本文非読）で行う
//   （firestore.ts の listUserIds。showMissing=true で missing document も拾う）。
//   日記本文・個人情報は読まない（constraints.md）。
// - Cloudflare Workers はフリープランで「1呼び出しあたりサブリクエスト50」の上限がある。
//   1件の generateInsight は最悪 getInsight+queryEntries+LLM+saveInsight ≒ 4 サブリクエスト。
//   そのため1回の cron で処理するユーザー数を CRON_MAX_USERS（既定20）で制限し、
//   生成対象タイプも既定を weekly/monthly の2種に絞る（quarterly は範囲が広く高コストのため
//   既定ではオンデマンドのまま。CRON_INSIGHT_TYPES で追加可能）。
// - スケール時（配布・ユーザー増）は有料プラン（サブリクエスト1000）＋ページング前提の
//   バッチ分割へ拡張する。本実装は CRON_MAX_USERS / CRON_INSIGHT_TYPES で調整できる。
//   なお listUserIds は __name__ 昇順の先頭から上限件を返すだけで日替わりローテーションは無いため、
//   ユーザー数が上限を超えると超過分は常に事前生成されない（表示時オンデマンドで生成される）。

const DEFAULT_MAX_USERS = 20;
const DEFAULT_TYPES: readonly InsightType[] = ['weekly', 'monthly'] as const;
const ALL_TYPES: readonly InsightType[] = ['weekly', 'monthly', 'quarterly'] as const;

// entries.date は端末ローカル日付（日本向けのため JST 前提。src/utils/date.ts の todayISO）。
// periodKey もクライアントが計算するのと同じ JST の壁時計で算出する必要がある。UTC のまま
// 算出すると、cron 発火時刻（UTC 15:00 ＝ JST 00:00、日付が変わった直後）では月/週境界の
// 直後に1つ古い期間を対象にしてしまい、その日ダッシュボードを開くユーザーが事前生成の恩恵を
// 受けられない（オンデマンド生成にフォールバックはする）。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 指定日時（UTC）が属する ISO8601 週のキー（YYYY-Www）を返す。insight.ts の weeklyRange の
// 逆写像で、weeklyRange(currentPeriodKey('weekly', d)) の範囲は必ず d を含む（round-trip 整合）。
function isoWeekKey(at: Date): string {
  // UTC 日付へ丸める（時刻成分を落とす）。
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const dow = d.getUTCDay() || 7; // 1(月)..7(日)
  // その週の木曜日へ移動する。ISO 週の年は「木曜日が属する年」で決まる。
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${isoYear}-W${pad2(week)}`;
}

// 指定日時（UTC）における、そのタイプの「現在期間」の periodKey。
// weekly は ISO 週（YYYY-Www）、monthly/quarterly は末尾月（YYYY-MM。quarterly はその月を含む直近3ヶ月）。
export function currentPeriodKey(type: InsightType, at: Date): string {
  if (type === 'weekly') return isoWeekKey(at);
  return `${at.getUTCFullYear()}-${pad2(at.getUTCMonth() + 1)}`;
}

// CRON_INSIGHT_TYPES（カンマ区切り）を検証済みのタイプ集合へ。未設定・不正のみは既定に戻す。
export function parseInsightTypes(raw: string | undefined): InsightType[] {
  if (!raw) return [...DEFAULT_TYPES];
  const seen = new Set<InsightType>();
  for (const token of raw.split(',')) {
    const t = token.trim();
    if ((ALL_TYPES as readonly string[]).includes(t)) seen.add(t as InsightType);
  }
  return seen.size > 0 ? [...seen] : [...DEFAULT_TYPES];
}

function parseMaxUsers(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : DEFAULT_MAX_USERS;
}

export interface CronResult {
  users: number; // 列挙できたユーザー数
  generated: number; // 生成（または鮮度キャッシュ流用）した (user, type) 件数
  skippedNoEntries: number; // 当該期間の日記が無くスキップした件数
  errors: number; // 失敗した件数（1件の失敗で全体は止めない）
}

// scheduled ハンドラ本体。現在期間の insights を全（上限内）ユーザー分だけ事前生成する。
// 1ユーザー・1タイプの失敗は握りつぶして次へ進む（バッチ全体を止めない）。
export async function handleScheduled(env: Env, scheduledTime: number): Promise<CronResult> {
  // JST の壁時計で「現在期間」を決める（JST_OFFSET_MS のコメント参照）。以降 currentPeriodKey は
  // getUTC* を使うため、JST ぶんずらした Date に対して呼ぶことで JST の暦日を読み出せる。
  const at = new Date(scheduledTime + JST_OFFSET_MS);
  const maxUsers = parseMaxUsers(env.CRON_MAX_USERS);
  const types = parseInsightTypes(env.CRON_INSIGHT_TYPES);

  const uids = await listUserIds(env, maxUsers);
  const result: CronResult = { users: uids.length, generated: 0, skippedNoEntries: 0, errors: 0 };
  if (uids.length === 0) {
    console.log('cron insights done', JSON.stringify(result));
    return result;
  }

  // ユーザーが1人以上いるときだけ LLM プロバイダを解決する。
  const llm = getLlmProvider(env);

  for (const uid of uids) {
    for (const type of types) {
      try {
        await handleGenerateInsight(env, llm, uid, { type, periodKey: currentPeriodKey(type, at) });
        result.generated += 1;
      } catch (err) {
        // 「この期間の日記がまだない」ユーザーは正常系（事前生成の対象外）としてスキップ扱い。
        if (err instanceof ApiError && err.code === 'failed-precondition') {
          result.skippedNoEntries += 1;
        } else {
          // uid・日記本文はログに残さない（constraints.md）。種別とエラー名のみ。
          console.warn('cron insight failed', type, (err as Error)?.name);
          result.errors += 1;
        }
      }
    }
  }

  // 集計値のみログ（uid・本文は残さない）。
  console.log('cron insights done', JSON.stringify(result));
  return result;
}

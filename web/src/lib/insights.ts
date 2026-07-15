import type { Insight, InsightType } from '@shared/types/insight';

import { callWorker } from './worker';

// 週次/月次まとめの取得（api-contract.md 3.5）。Worker が entries から集計＋文章化し
// insights にキャッシュした結果を返す（日記本文は LLM へ送らない）。
export async function fetchInsight(type: InsightType, periodKey: string): Promise<Insight> {
  return callWorker<{ type: InsightType; periodKey: string }, Insight>('/generateInsight', {
    type,
    periodKey,
  });
}

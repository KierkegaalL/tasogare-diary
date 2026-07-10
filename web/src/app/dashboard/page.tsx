'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import type { Insight, InsightType } from '@shared/types/insight';

import { useAuth } from '@/hooks/useAuth';
import { getFirebaseAuth } from '@/lib/firebase';
import { fetchInsight } from '@/lib/insights';
import { WorkerError } from '@/lib/worker';
import { currentPeriodKey, PERIOD_LABELS } from '@/lib/period';
import { DashCard } from '@/components/DashCard';
import { MoodChart } from '@/components/MoodChart';
import { WordRank } from '@/components/WordRank';

const PERIODS: InsightType[] = ['weekly', 'monthly'];

type Load =
  | { state: 'loading' }
  | { state: 'empty' } // 期間内にエントリが無い（failed-precondition）
  | { state: 'error'; message: string }
  | { state: 'ready'; insight: Insight };

// 振り返りダッシュボード（Web / screen.md 4.1）。閲覧専用（U-09）。
// 期間タブで generateInsight を呼び、感情推移・よく使う言葉・AIまとめを表示する。
export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [type, setType] = useState<InsightType>('monthly');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  // リクエスト世代。タブを素早く切り替えた際、古い応答で新しいタブの表示を上書きしないためのガード。
  const requestId = useRef(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/connect');
  }, [user, loading, router]);

  const reload = useCallback(async (t: InsightType) => {
    const myId = ++requestId.current;
    setLoad({ state: 'loading' });
    try {
      const insight = await fetchInsight(t, currentPeriodKey(t));
      if (myId !== requestId.current) return; // より新しい要求が始まっていれば破棄。
      setLoad({ state: 'ready', insight });
    } catch (err) {
      if (myId !== requestId.current) return;
      if (err instanceof WorkerError && err.code === 'failed-precondition') {
        setLoad({ state: 'empty' });
        return;
      }
      setLoad({
        state: 'error',
        message: err instanceof Error ? err.message : 'まとめの取得に失敗しました。',
      });
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    void reload(type);
  }, [type, user, loading, reload]);

  if (loading || !user) {
    return <main style={styles.centered}>読み込み中…</main>;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 className="dash-title" style={styles.title}>
            振り返りダッシュボード
          </h1>
          <p style={styles.subtitle}>書いた日記を、そのまま振り返れます（閲覧専用）。</p>
        </div>
        <button onClick={() => void signOut(getFirebaseAuth())} style={styles.signOut}>
          サインアウト
        </button>
      </header>

      <div className="period-tabs" style={styles.tabs} role="tablist" aria-label="期間">
        {PERIODS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={type === t}
            onClick={() => setType(t)}
            style={{ ...styles.tab, ...(type === t ? styles.tabActive : null) }}
          >
            {PERIOD_LABELS[t]}
          </button>
        ))}
      </div>

      <DashboardBody type={type} load={load} onRetry={() => void reload(type)} />
    </div>
  );
}

function DashboardBody({
  type,
  load,
  onRetry,
}: {
  type: InsightType;
  load: Load;
  onRetry: () => void;
}) {
  if (load.state === 'loading') {
    return <p style={styles.note}>まとめを読み込んでいます…</p>;
  }
  if (load.state === 'empty') {
    return (
      <DashCard title="記録がまだありません">
        <p style={styles.note}>この{PERIOD_LABELS[type]}の日記がまだありません。スマホで日記を書くと、ここに振り返りが表示されます。</p>
      </DashCard>
    );
  }
  if (load.state === 'error') {
    return (
      <DashCard title="読み込みに失敗しました">
        <p style={styles.note}>{load.message}</p>
        <button onClick={onRetry} style={styles.retry}>
          再試行
        </button>
      </DashCard>
    );
  }

  const { insight } = load;
  return (
    <div style={styles.grid}>
      <DashCard className="dash-narrative" title={`AIによる${PERIOD_LABELS[type]}のまとめ`}>
        <p className="dash-narrative-text" style={styles.narrative}>
          {insight.narrative}
        </p>
      </DashCard>
      <DashCard title="感情の推移">
        <MoodChart distribution={insight.moodDistribution} />
      </DashCard>
      <DashCard title="よく使う言葉">
        <WordRank words={insight.topWords} />
      </DashCard>
      <p className="dash-note" style={styles.dashNote}>
        分析はこの Web 画面だけで見られます（スマホには表示しない設計です）。
      </p>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 720, margin: '0 auto', padding: '32px 20px 64px' },
  centered: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--ink-soft)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 20,
  },
  title: { fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 },
  subtitle: { color: 'var(--ink-soft)', fontSize: 13, margin: '4px 0 0' },
  signOut: {
    flexShrink: 0,
    padding: '8px 14px',
    fontSize: 13,
    color: 'var(--ink-soft)',
    background: 'transparent',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-pill)',
  },
  tabs: { display: 'flex', gap: 8, marginBottom: 20 },
  tab: {
    padding: '8px 18px',
    fontSize: 14,
    color: 'var(--ink-soft)',
    background: 'var(--paper-soft)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-pill)',
  },
  tabActive: { background: 'var(--dusk-deep)', color: 'var(--paper-soft)', borderColor: 'var(--dusk-deep)' },
  grid: { display: 'grid', gap: 16 },
  narrative: { margin: 0, fontSize: 15, lineHeight: 1.9, color: 'var(--ink)' },
  note: { color: 'var(--ink-soft)', fontSize: 14, margin: 0 },
  dashNote: { color: 'var(--ink-faint)', fontSize: 12, textAlign: 'center', margin: '4px 0 0' },
  retry: {
    marginTop: 14,
    padding: '10px 20px',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--dusk-deep)',
    color: 'var(--paper-soft)',
    fontSize: 14,
  },
};

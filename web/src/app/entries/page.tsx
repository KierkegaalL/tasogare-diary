'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/hooks/useAuth';
import { fetchEntriesForMonth, type DiaryEntry } from '@/lib/entries';
import { currentMonthKey, formatMonthLabel, shiftMonthKey } from '@/lib/period';
import { EntryList } from '@/components/EntryList';
import { DashCard } from '@/components/DashCard';

type Load =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; entries: DiaryEntry[] };

// 日記一覧（Web・閲覧専用 U-09）。書いた日記本文をそのまま月ごとに振り返る（screen.md 3.10 の約束を Web で実現）。
// Firestore を直読し、月移動で過去へさかのぼる。編集導線は持たない。
export default function EntriesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [monthKey, setMonthKey] = useState<string>(() => currentMonthKey());
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  // リクエスト世代ガード。月を素早く切り替えても古い応答で新しい月を上書きしない。
  const requestId = useRef(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/connect');
  }, [user, loading, router]);

  const reload = useCallback(
    async (uid: string, key: string) => {
      const myId = ++requestId.current;
      setLoad({ state: 'loading' });
      try {
        const entries = await fetchEntriesForMonth(uid, key);
        if (myId !== requestId.current) return;
        setLoad({ state: 'ready', entries });
      } catch (err) {
        if (myId !== requestId.current) return;
        setLoad({
          state: 'error',
          message: err instanceof Error ? err.message : '日記の取得に失敗しました。',
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (loading || !user) return;
    void reload(user.uid, monthKey);
  }, [user, loading, monthKey, reload]);

  if (loading || !user) {
    return <main style={styles.centered}>読み込み中…</main>;
  }

  // 当月以降（未来月を含む）は「次の月」へ進めない。
  const isAtOrAfterCurrentMonth = monthKey >= currentMonthKey();

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>日記の一覧</h1>
          <p style={styles.subtitle}>書いた日記を、そのまま読み返せます（閲覧専用）。</p>
        </div>
        <Link href="/dashboard" style={styles.navLink}>
          振り返りダッシュボード →
        </Link>
      </header>

      <div style={styles.monthNav}>
        <button onClick={() => setMonthKey((k) => shiftMonthKey(k, -1))} style={styles.monthBtn}>
          ← 前の月
        </button>
        <span style={styles.monthLabel}>{formatMonthLabel(monthKey)}</span>
        <button
          onClick={() => setMonthKey((k) => shiftMonthKey(k, 1))}
          disabled={isAtOrAfterCurrentMonth}
          style={{ ...styles.monthBtn, ...(isAtOrAfterCurrentMonth ? styles.monthBtnDisabled : null) }}
        >
          次の月 →
        </button>
      </div>

      <EntriesBody
        monthKey={monthKey}
        load={load}
        onRetry={() => void reload(user.uid, monthKey)}
      />

      <p style={styles.note}>この一覧は Web でのみ表示します（スマホには出さない設計です）。</p>
    </div>
  );
}

function EntriesBody({
  monthKey,
  load,
  onRetry,
}: {
  monthKey: string;
  load: Load;
  onRetry: () => void;
}) {
  if (load.state === 'loading') {
    return <p style={styles.info}>日記を読み込んでいます…</p>;
  }
  if (load.state === 'error') {
    return (
      <DashCard title="読み込みに失敗しました">
        <p style={styles.info}>{load.message}</p>
        <button onClick={onRetry} style={styles.retry}>
          再試行
        </button>
      </DashCard>
    );
  }
  if (load.entries.length === 0) {
    return (
      <DashCard title="この月の日記はありません">
        <p style={styles.info}>
          {formatMonthLabel(monthKey)}の日記がまだありません。スマホで日記を書くと、ここに表示されます。
        </p>
      </DashCard>
    );
  }
  return <EntryList entries={load.entries} />;
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
  navLink: { flexShrink: 0, fontSize: 13, color: 'var(--dusk-deep)', textDecoration: 'none' },
  monthNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  monthBtn: {
    padding: '8px 14px',
    fontSize: 13,
    color: 'var(--ink-soft)',
    background: 'var(--paper-soft)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-pill)',
  },
  monthBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  monthLabel: { fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)' },
  info: { color: 'var(--ink-soft)', fontSize: 14, margin: 0 },
  note: { color: 'var(--ink-faint)', fontSize: 12, textAlign: 'center', margin: '24px 0 0' },
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

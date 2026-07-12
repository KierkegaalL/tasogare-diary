'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

import { useAuth } from '@/hooks/useAuth';
import { fetchEntriesPage, type DiaryEntry } from '@/lib/entries';
import { EntryList } from '@/components/EntryList';
import { DashCard } from '@/components/DashCard';

const PAGE_SIZE = 20;

type Status = 'loading' | 'ready' | 'error';

// 日記一覧（Web・閲覧専用 U-09）。書いた日記本文をそのまま通し読みで振り返る（screen.md 3.10 の約束を Web で実現）。
// Firestore を直読し、スクロールで過去へさかのぼる（無限スクロール）。検索は読み込み済み範囲内をキーワードで絞り込む
// （Firestore は全文検索非対応・本文を外部の検索サービスへは送らない方針のため）。編集導線は持たない。
export default function EntriesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchText, setSearchText] = useState('');
  const cursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 初回ロードの世代ガード。同一 uid で複数回発火しても、最新の呼び出し以外の応答で状態を巻き戻さない。
  const firstPageRequestId = useRef(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/connect');
  }, [user, loading, router]);

  const loadMore = useCallback(
    async (uid: string, isFirstPage: boolean) => {
      const myRequestId = isFirstPage ? ++firstPageRequestId.current : firstPageRequestId.current;
      if (isFirstPage) {
        setStatus('loading');
      } else {
        setLoadingMore(true);
      }
      try {
        const page = await fetchEntriesPage(uid, isFirstPage ? null : cursorRef.current, PAGE_SIZE);
        if (isFirstPage && myRequestId !== firstPageRequestId.current) return;
        cursorRef.current = page.cursor;
        setEntries((prev) => (isFirstPage ? page.entries : [...prev, ...page.entries]));
        setHasMore(page.hasMore);
        setStatus('ready');
      } catch (err) {
        if (isFirstPage && myRequestId !== firstPageRequestId.current) return;
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : '日記の取得に失敗しました。');
      } finally {
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (loading || !user) return;
    cursorRef.current = null;
    void loadMore(user.uid, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, loading]);

  // 無限スクロール: 一覧末尾の目印が画面に入ったら次ページを読み込む。
  useEffect(() => {
    if (!user || status !== 'ready' || !hasMore || loadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries.some((e) => e.isIntersecting)) {
          void loadMore(user.uid, false);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [user, status, hasMore, loadingMore, loadMore]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredEntries = useMemo(() => {
    if (!normalizedSearch) return entries;
    return entries.filter((entry) => {
      if (entry.bodyText.toLowerCase().includes(normalizedSearch)) return true;
      return entry.words.some((w) => w.text.toLowerCase().includes(normalizedSearch));
    });
  }, [entries, normalizedSearch]);

  if (loading || !user) {
    return <main style={styles.centered}>読み込み中…</main>;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>日記の一覧</h1>
          <p style={styles.subtitle}>書いた日記を、そのまま読み返せます（閲覧専用）。</p>
        </div>
        <div style={styles.headerLinks}>
          <Link href="/dashboard" style={styles.navLink}>
            振り返りダッシュボード →
          </Link>
          <Link href="/settings" style={styles.navLink}>
            設定
          </Link>
        </div>
      </header>

      <input
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="読み込み済みの日記をキーワードで絞り込む"
        aria-label="日記の検索"
        style={styles.search}
      />

      <EntriesBody
        status={status}
        errorMessage={errorMessage}
        entries={filteredEntries}
        hasSearch={normalizedSearch.length > 0}
        hasMore={hasMore}
        onRetry={() => void loadMore(user.uid, true)}
      />

      {status === 'ready' && hasMore && <div ref={sentinelRef} aria-hidden />}
      {loadingMore && <p style={styles.info}>さらに読み込んでいます…</p>}
      {status === 'ready' && !hasMore && entries.length > 0 && (
        <p style={styles.info}>すべての日記を読み込みました。</p>
      )}

      <p style={styles.note}>この一覧は Web でのみ表示します（スマホには出さない設計です）。</p>
    </div>
  );
}

function EntriesBody({
  status,
  errorMessage,
  entries,
  hasSearch,
  hasMore,
  onRetry,
}: {
  status: Status;
  errorMessage: string;
  entries: DiaryEntry[];
  hasSearch: boolean;
  hasMore: boolean;
  onRetry: () => void;
}) {
  if (status === 'loading') {
    return <p style={styles.info}>日記を読み込んでいます…</p>;
  }
  if (status === 'error') {
    return (
      <DashCard title="読み込みに失敗しました">
        <p style={styles.info}>{errorMessage}</p>
        <button onClick={onRetry} style={styles.retry}>
          再試行
        </button>
      </DashCard>
    );
  }
  if (entries.length === 0) {
    return (
      <DashCard title={hasSearch ? '一致する日記が見つかりません' : 'まだ日記がありません'}>
        <p style={styles.info}>
          {hasSearch
            ? hasMore
              ? '読み込み済みの範囲に一致する日記がありませんでした。下にスクロールしてさらに読み込むか、キーワードを変えてみてください。'
              : '読み込んだすべての日記の中に一致するものがありませんでした。キーワードを変えてみてください。'
            : 'スマホで日記を書くと、ここに表示されます。'}
        </p>
      </DashCard>
    );
  }
  return <EntryList entries={entries} />;
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
  headerLinks: { flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 },
  navLink: { fontSize: 13, color: 'var(--dusk-deep)', textDecoration: 'none' },
  search: {
    width: '100%',
    padding: '11px 14px',
    fontSize: 14,
    marginBottom: 20,
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--paper)',
    color: 'var(--ink)',
  },
  info: { color: 'var(--ink-soft)', fontSize: 14, margin: '12px 0', textAlign: 'center' },
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

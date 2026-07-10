'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/hooks/useAuth';
import { CenteredCard } from '@/components/CenteredCard';

// ランディング。サインイン済みならダッシュボードへ、未サインインなら連携画面へ振り分ける。
export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/dashboard' : '/connect');
  }, [user, loading, router]);

  return (
    <CenteredCard>
      <p style={{ color: 'var(--ink-soft)' }}>読み込み中…</p>
    </CenteredCard>
  );
}

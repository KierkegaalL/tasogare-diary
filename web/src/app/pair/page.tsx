'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { extractPairingToken, signInWithPairingToken } from '@/lib/pairing';
import { isWorkerConfigured } from '@/lib/worker';
import { CenteredCard } from '@/components/CenteredCard';

type Status = 'verifying' | 'error';

// モバイルの QR ディープリンク（`<WEB_URL>/pair?token=...`）の着地点。
// トークンを照合してサインインし、成功でダッシュボードへ遷移する（api-contract.md 5.2）。
function PairInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // Strict Mode の二重実行でトークンを二重消費しない。
    started.current = true;

    const token = extractPairingToken(params.get('token') ?? '');
    if (!isWorkerConfigured) {
      setStatus('error');
      setMessage('サーバ URL が未設定です。');
      return;
    }
    if (!token) {
      setStatus('error');
      setMessage('ペアリングコードが見つかりません。QR を読み取り直してください。');
      return;
    }

    signInWithPairingToken(token)
      .then(() => router.replace('/dashboard'))
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'サインインに失敗しました。');
      });
  }, [params, router]);

  return (
    <CenteredCard>
      {status === 'verifying' ? (
        <>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>連携しています…</h1>
          <p style={{ color: 'var(--ink-soft)' }}>スマホの日記データを安全につないでいます。</p>
        </>
      ) : (
        <>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>連携できませんでした</h1>
          <p style={{ color: 'var(--ink-soft)' }}>{message}</p>
          <button onClick={() => router.replace('/connect')} style={buttonStyle}>
            もう一度つなぐ
          </button>
        </>
      )}
    </CenteredCard>
  );
}

const buttonStyle = {
  marginTop: 20,
  padding: '12px 24px',
  border: 'none',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--dusk-deep)',
  color: 'var(--paper-soft)',
  fontSize: 15,
};

export default function PairPage() {
  return (
    <Suspense
      fallback={
        <CenteredCard>
          <p style={{ color: 'var(--ink-soft)' }}>読み込み中…</p>
        </CenteredCard>
      }
    >
      <PairInner />
    </Suspense>
  );
}

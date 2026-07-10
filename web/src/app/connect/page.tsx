'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/hooks/useAuth';
import { isFirebaseConfigured } from '@/lib/firebase';
import { isWorkerConfigured } from '@/lib/worker';
import { extractPairingToken, signInWithPairingToken } from '@/lib/pairing';
import { CenteredCard } from '@/components/CenteredCard';
import { QrScanner } from '@/components/QrScanner';

// デバイスをつなぐ（Web / screen.md 4.2）。
// スマホに表示された QR をカメラでライブ読取（QrScanner）。非対応環境向けに
// 「QR の内容（URL／コード）を貼り付けて連携」する導線も常に残す。
export default function ConnectPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  // すでにサインイン済みならダッシュボードへ。
  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  const notConfigured = !isFirebaseConfigured || !isWorkerConfigured;

  async function connectWithRaw(raw: string) {
    setError('');
    const token = extractPairingToken(raw);
    if (!token) {
      setError('コードを入力してください。');
      return;
    }
    setBusy(true);
    try {
      await signInWithPairingToken(token);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '連携に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  function handleConnect() {
    void connectWithRaw(input);
  }

  function handleDecode(text: string) {
    setScanning(false);
    void connectWithRaw(text);
  }

  return (
    <CenteredCard>
      {scanning ? (
        <QrScanner onDecode={handleDecode} onClose={() => setScanning(false)} />
      ) : (
        <div style={styles.viewfinder} aria-hidden>
          <span style={styles.corner('tl')} />
          <span style={styles.corner('tr')} />
          <span style={styles.corner('bl')} />
          <span style={styles.corner('br')} />
        </div>
      )}
      <h1 style={styles.title}>スマホのQRコードをつなぐ</h1>
      <p style={styles.sub}>
        スマホアプリの「Webで見る」に表示された QR をカメラで読み取るか、コード（URL）を貼り付けてください。
      </p>

      {notConfigured ? (
        <p style={styles.notice}>
          Firebase／サーバ URL が未設定のため、現在は連携できません（環境変数を設定してください）。
        </p>
      ) : (
        <>
          {!scanning && (
            <button onClick={() => setScanning(true)} style={styles.secondary} disabled={busy}>
              カメラで読み取る
            </button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://tasogare-diary.app/pair?token=… または コード"
            style={styles.input}
            aria-label="ペアリングコード"
            disabled={busy}
          />
          {error && (
            <p style={styles.error} role="alert">
              {error}
            </p>
          )}
          <button onClick={handleConnect} style={styles.primary} disabled={busy}>
            {busy ? '連携しています…' : 'つなぐ'}
          </button>
        </>
      )}

      <p style={styles.footNote}>スマホの日記データはそのまま、安全に保たれます。</p>
    </CenteredCard>
  );
}

const styles = {
  viewfinder: {
    position: 'relative',
    width: 140,
    height: 140,
    margin: '0 auto 20px',
    borderRadius: 12,
    background: 'var(--dusk-soft)',
  } as CSSProperties,
  corner: (pos: 'tl' | 'tr' | 'bl' | 'br'): CSSProperties => ({
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: 'var(--dusk-deep)',
    borderStyle: 'solid',
    borderWidth: 0,
    ...(pos.includes('t') ? { top: 10, borderTopWidth: 3 } : { bottom: 10, borderBottomWidth: 3 }),
    ...(pos.includes('l') ? { left: 10, borderLeftWidth: 3 } : { right: 10, borderRightWidth: 3 }),
  }),
  title: { fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 8px' } as CSSProperties,
  sub: { color: 'var(--ink-soft)', fontSize: 14, margin: '0 0 20px' } as CSSProperties,
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 14,
    border: '1px solid var(--line)',
    borderRadius: 10,
    background: 'var(--paper)',
    color: 'var(--ink)',
  } as CSSProperties,
  primary: {
    marginTop: 14,
    width: '100%',
    padding: '13px 24px',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--dusk-deep)',
    color: 'var(--paper-soft)',
    fontSize: 15,
  } as CSSProperties,
  secondary: {
    marginBottom: 14,
    width: '100%',
    padding: '11px 24px',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--paper-soft)',
    color: 'var(--ink)',
    fontSize: 14,
  } as CSSProperties,
  error: { color: 'var(--heavy)', fontSize: 13, margin: '10px 0 0' } as CSSProperties,
  notice: { color: 'var(--ink-soft)', fontSize: 13, margin: '4px 0 0' } as CSSProperties,
  footNote: {
    color: 'var(--ink-faint)',
    fontSize: 12,
    margin: '22px 0 0',
  } as CSSProperties,
};

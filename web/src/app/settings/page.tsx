'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';

import { useAuth } from '@/hooks/useAuth';
import { getFirebaseAuth } from '@/lib/firebase';
import { deleteAccount, isAccountDeletionAvailable } from '@/lib/account';

// 設定（Web・日記一覧側）。日記の一覧（/entries）からのみ導線を出す
// （ダッシュボード・モバイルには手を入れない。ユーザー指摘）。
// 「スマホと連携する」（未連携＝匿名時）／「ログアウトする」（連携済み時）と、
// アカウント削除を1画面にまとめる。
export default function SettingsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace('/connect');
  }, [user, loading, router]);

  if (loading || !user) {
    return <main style={styles.centered}>読み込み中…</main>;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button
          onClick={() => router.back()}
          style={styles.backButton}
          aria-label="戻る"
        >
          ←
        </button>
        <h1 style={styles.title}>設定</h1>
      </header>

      <div style={styles.sections}>
        {user.isAnonymous ? <ConnectRow /> : <SignOutRow />}
        {isAccountDeletionAvailable ? <DeleteAccountRow /> : null}
      </div>
    </div>
  );
}

// 未連携（匿名セッション）: スマホと連携して同じ日記を見られるようにする導線。
function ConnectRow() {
  const router = useRouter();
  return (
    <section style={styles.row}>
      <div>
        <p style={styles.rowLabel}>スマホと連携する</p>
        <p style={styles.rowSub}>書いた日記を、ここでもそのまま読めるようにします。</p>
      </div>
      <button onClick={() => router.push('/connect')} style={styles.rowButton}>
        連携する
      </button>
    </section>
  );
}

// 連携済み（匿名でない・QR連携またはOAuthサインイン済み）: このブラウザから離れる導線。
function SignOutRow() {
  return (
    <section style={styles.row}>
      <div>
        <p style={styles.rowLabel}>ログアウトする</p>
        <p style={styles.rowSub}>このブラウザでのサインインを終了します。</p>
      </div>
      <button onClick={() => void signOut(getFirebaseAuth())} style={styles.rowButton}>
        ログアウト
      </button>
    </section>
  );
}

// アカウント削除（モバイルの DeleteAccountSection と同じ2段階確認）。
function DeleteAccountRow() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function onConfirm() {
    setBusy(true);
    setError(false);
    try {
      await deleteAccount();
    } catch {
      setBusy(false);
      setError(true);
      return;
    }
    try {
      await signOut(getFirebaseAuth());
    } finally {
      router.replace('/connect');
    }
  }

  if (!confirming) {
    return (
      <section style={styles.row}>
        <div>
          <p style={styles.rowLabel}>アカウントを削除する</p>
          <p style={styles.rowSub}>日記・対話・連携情報がすべて削除されます</p>
        </div>
        <button onClick={() => setConfirming(true)} style={styles.dangerOutlineButton}>
          削除する
        </button>
      </section>
    );
  }

  return (
    <section style={{ ...styles.row, ...styles.confirmBox }}>
      <p style={styles.confirmText}>
        本当に削除しますか？この操作は取り消せません。日記・対話・連携情報がすべて削除されます。
      </p>
      {error ? <p style={styles.confirmError}>削除に失敗しました。もう一度お試しください。</p> : null}
      {busy ? (
        <p style={styles.rowSub}>削除しています…</p>
      ) : (
        <div style={styles.confirmActions}>
          <button onClick={() => void onConfirm()} style={styles.dangerButton}>
            本当に削除する
          </button>
          <button
            onClick={() => {
              setConfirming(false);
              setError(false);
            }}
            style={styles.rowButton}
          >
            キャンセル
          </button>
        </div>
      )}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 560, margin: '0 auto', padding: '32px 20px 64px' },
  centered: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--ink-soft)',
  },
  header: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '1px solid var(--line)',
    background: 'var(--paper-soft)',
    color: 'var(--ink-soft)',
    fontSize: 15,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  title: { fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 },
  sections: { display: 'flex', flexDirection: 'column', gap: 14 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    background: 'var(--paper-soft)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: '18px 20px',
  },
  rowLabel: { fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 },
  rowSub: { fontSize: 12, color: 'var(--ink-faint)', margin: '4px 0 0' },
  rowButton: {
    flexShrink: 0,
    padding: '9px 18px',
    fontSize: 13,
    color: 'var(--ink)',
    background: 'var(--paper)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-pill)',
  },
  dangerOutlineButton: {
    flexShrink: 0,
    padding: '9px 18px',
    fontSize: 13,
    color: 'var(--heavy)',
    background: 'var(--paper)',
    border: '1px solid var(--heavy)',
    borderRadius: 'var(--radius-pill)',
  },
  confirmBox: { flexDirection: 'column', alignItems: 'stretch', borderColor: 'var(--heavy)', background: 'var(--heavy-soft)' },
  confirmText: { fontSize: 13, lineHeight: 1.8, color: 'var(--ink)', margin: 0 },
  confirmError: { fontSize: 12, color: 'var(--heavy)', margin: '10px 0 0' },
  confirmActions: { display: 'flex', gap: 10, marginTop: 14 },
  dangerButton: {
    flex: 1,
    padding: '11px 18px',
    fontSize: 14,
    color: '#ffffff',
    background: 'var(--heavy)',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
  },
};

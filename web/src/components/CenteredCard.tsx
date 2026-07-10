import type { CSSProperties, ReactNode } from 'react';

// 中央寄せのカード枠（サインイン系画面の共通レイアウト）。
export function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <main style={styles.wrap}>
      <section style={styles.card}>{children}</section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    background: 'var(--paper-soft)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
    padding: '32px 28px',
    textAlign: 'center',
  },
};

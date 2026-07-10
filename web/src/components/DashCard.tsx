import type { CSSProperties, ReactNode } from 'react';

// ダッシュボードのカード枠（screen.md 4.1 `.dash-card`）。
// className は visual-design.html 由来のクラス名を残してトレーサビリティ／将来の見た目照合に備える。
export function DashCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={['dash-card', className].filter(Boolean).join(' ')} style={styles.card}>
      <h2 style={styles.title}>{title}</h2>
      {children}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: 'var(--paper-soft)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
    padding: '20px 22px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 16,
    margin: '0 0 16px',
    color: 'var(--ink)',
  },
};

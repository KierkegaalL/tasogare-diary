import type { CSSProperties } from 'react';
import type { TopWord } from '@shared/types/insight';

// よく使う言葉（screen.md 4.1 `.word-rank`）。上位語＋件数。件数バーで大小を可視化。
export function WordRank({ words }: { words: TopWord[] }) {
  if (words.length === 0) {
    return <p style={styles.empty}>まだ言葉が集まっていません。</p>;
  }
  const max = Math.max(...words.map((w) => w.count), 1);

  return (
    <ol className="word-rank" style={styles.list}>
      {words.map((w, i) => (
        <li key={`${w.word}-${i}`} style={styles.row}>
          <span style={styles.rank}>{i + 1}</span>
          <span style={styles.word}>{w.word}</span>
          <span style={styles.track}>
            <span style={{ ...styles.fill, width: `${(w.count / max) * 100}%` }} />
          </span>
          <span style={styles.count}>{w.count}</span>
        </li>
      ))}
    </ol>
  );
}

const styles: Record<string, CSSProperties> = {
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 },
  row: { display: 'grid', gridTemplateColumns: '24px 1fr 90px 32px', alignItems: 'center', gap: 10 },
  rank: { color: 'var(--ink-faint)', fontSize: 13, textAlign: 'center' },
  word: { fontSize: 15, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis' },
  track: { height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' },
  fill: { display: 'block', height: '100%', background: 'var(--dusk)' },
  count: { fontSize: 13, color: 'var(--ink-soft)', textAlign: 'right' },
  empty: { color: 'var(--ink-soft)', fontSize: 14 },
};

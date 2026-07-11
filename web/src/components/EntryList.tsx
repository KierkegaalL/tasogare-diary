import type { CSSProperties } from 'react';
import { moodColor, moodLabel } from '@shared/theme/tokens';

import type { DiaryEntry } from '@/lib/entries';
import { formatEntryDate } from '@/lib/period';

// 日記本文の一覧（screen.md 3.8 `.diary-full-text`/`.tags-used` を Web で閲覧専用に再現）。
// 1日1件（U-11）を前提に、月内のエントリを date 降順で縦に並べる。
export function EntryList({ entries }: { entries: DiaryEntry[] }) {
  return (
    <ol style={styles.list}>
      {entries.map((entry) => (
        <li key={entry.id}>
          <EntryItem entry={entry} />
        </li>
      ))}
    </ol>
  );
}

function EntryItem({ entry }: { entry: DiaryEntry }) {
  return (
    <article className="diary-entry" style={styles.card}>
      <header style={styles.head}>
        <h3 style={styles.date}>{formatEntryDate(entry.date)}</h3>
        {entry.mood ? (
          <span
            style={{ ...styles.moodChip, background: `${moodColor(entry.mood)}22`, color: 'var(--ink)' }}
          >
            <span style={{ ...styles.moodDot, background: moodColor(entry.mood) }} />
            {moodLabel(entry.mood)}
          </span>
        ) : null}
      </header>

      {entry.bodyText ? (
        <p className="diary-full-text" style={styles.body}>
          {entry.bodyText}
        </p>
      ) : (
        <p style={styles.bodyEmpty}>本文がありません。</p>
      )}

      {entry.words.length > 0 ? (
        <ul className="tags-used" style={styles.tags}>
          {entry.words.map((w, i) => (
            <li key={`${w.text}-${i}`} style={styles.tag}>
              {w.text}
            </li>
          ))}
        </ul>
      ) : null}

      {entry.awareness ? <p style={styles.awareness}>きづき: {entry.awareness}</p> : null}
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16 },
  card: {
    background: 'var(--paper-soft)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
    padding: '18px 20px',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 },
  date: { fontFamily: 'var(--font-display)', fontSize: 16, margin: 0, color: 'var(--ink)' },
  moodChip: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    fontSize: 12,
    borderRadius: 'var(--radius-pill)',
  },
  moodDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  body: { margin: 0, fontSize: 15, lineHeight: 1.9, color: 'var(--ink)', whiteSpace: 'pre-wrap' },
  bodyEmpty: { margin: 0, fontSize: 14, color: 'var(--ink-soft)' },
  tags: {
    listStyle: 'none',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: 0,
    margin: '14px 0 0',
  },
  tag: {
    padding: '4px 12px',
    fontSize: 12,
    color: 'var(--ink-soft)',
    background: 'var(--paper)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-pill)',
  },
  awareness: { margin: '12px 0 0', fontSize: 13, color: 'var(--ink-soft)' },
};

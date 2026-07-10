import type { CSSProperties } from 'react';
import { MOOD_LEVELS, moodColor, moodLabel } from '@shared/theme/tokens';
import type { MoodDistribution } from '@shared/types/insight';

// 感情の推移（screen.md 4.1 `.mood-chart`）。百分率の積み上げバー＋凡例。
// 色のみに依存しないよう数値・凡例を併記する（A11y）。
export function MoodChart({ distribution }: { distribution: MoodDistribution }) {
  const total = MOOD_LEVELS.reduce((sum, m) => sum + (distribution[m] ?? 0), 0);

  return (
    <div>
      <div
        className="mood-chart"
        style={styles.bar}
        role="img"
        aria-label={MOOD_LEVELS.map((m) => `${moodLabel(m)} ${distribution[m] ?? 0}%`).join('、')}
      >
        {total === 0 ? (
          <div style={{ ...styles.segment, flex: 1, background: 'var(--line)' }} />
        ) : (
          MOOD_LEVELS.map((m) => {
            const value = distribution[m] ?? 0;
            if (value <= 0) return null;
            return (
              <div
                key={m}
                style={{ ...styles.segment, flexGrow: value, background: moodColor(m) }}
                title={`${moodLabel(m)} ${value}%`}
              />
            );
          })
        )}
      </div>
      <ul className="legend" style={styles.legend}>
        {MOOD_LEVELS.map((m) => (
          <li key={m} style={styles.legendItem}>
            <span style={{ ...styles.dot, background: moodColor(m) }} />
            {moodLabel(m)}
            <span style={styles.pct}>{distribution[m] ?? 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  bar: {
    display: 'flex',
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    background: 'var(--line)',
  },
  segment: { height: '100%' },
  legend: {
    listStyle: 'none',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px 18px',
    padding: 0,
    margin: '14px 0 0',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: 'var(--ink-soft)',
  },
  dot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  pct: { color: 'var(--ink)', fontWeight: 600 },
};

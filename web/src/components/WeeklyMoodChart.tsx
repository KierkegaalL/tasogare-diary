import type { CSSProperties } from 'react';
import { MOOD_LEVELS, moodColor, moodLabel } from '@shared/theme/tokens';
import type { WeeklyMoodPoint } from '@shared/types/insight';

// 感情の推移（週ごと・screen.md 4.1「過去3ヶ月」タブ）。週ごとの百分率積み上げバーを横に並べる。
// 色のみに依存しないよう凡例・ツールチップを併記する（A11y、MoodChart と同方針）。
export function WeeklyMoodChart({ weeks }: { weeks: WeeklyMoodPoint[] }) {
  return (
    <div>
      <div style={styles.row}>
        {weeks.map((w) => {
          const total = MOOD_LEVELS.reduce((sum, m) => sum + (w.distribution[m] ?? 0), 0);
          return (
            <div key={w.weekStart} style={styles.column}>
              <div
                className="mood-chart"
                style={styles.bar}
                role="img"
                aria-label={`${formatWeekLabel(w.weekStart)}週: ${MOOD_LEVELS.map(
                  (m) => `${moodLabel(m)} ${w.distribution[m] ?? 0}%`,
                ).join('、')}`}
              >
                {total === 0 ? (
                  <div style={{ ...styles.segment, flex: 1, background: 'var(--line)' }} />
                ) : (
                  MOOD_LEVELS.map((m) => {
                    const value = w.distribution[m] ?? 0;
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
              <span style={styles.weekLabel}>{formatWeekLabel(w.weekStart)}</span>
            </div>
          );
        })}
      </div>
      <ul className="legend" style={styles.legend}>
        {MOOD_LEVELS.map((m) => (
          <li key={m} style={styles.legendItem}>
            <span style={{ ...styles.dot, background: moodColor(m) }} />
            {moodLabel(m)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// YYYY-MM-DD（週の月曜）→ "M/D" の短い表示。
function formatWeekLabel(weekStart: string): string {
  const [, month, day] = weekStart.split('-');
  return `${Number(month)}/${Number(day)}`;
}

const styles: Record<string, CSSProperties> = {
  row: { display: 'flex', gap: 6, alignItems: 'stretch', overflowX: 'auto', paddingBottom: 4 },
  column: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: '1 0 32px', minWidth: 32 },
  bar: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: 120,
    borderRadius: 6,
    overflow: 'hidden',
    background: 'var(--line)',
  },
  segment: { width: '100%' },
  weekLabel: { fontSize: 11, color: 'var(--ink-faint)', whiteSpace: 'nowrap' },
  legend: {
    listStyle: 'none',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px 18px',
    padding: 0,
    margin: '14px 0 0',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-soft)' },
  dot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
};

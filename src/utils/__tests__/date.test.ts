import { formatMonthDay, formatYearMonth, monthGrid, todayISO, weekDatesMonday, weekdayJa, ymd } from '../date';

describe('utils/date', () => {
  it('todayISO は YYYY-MM-DD を返す', () => {
    expect(todayISO(new Date(2026, 6, 1))).toBe('2026-07-01');
  });

  it('ymd / formatMonthDay / formatYearMonth', () => {
    expect(ymd('2026-07-01')).toEqual({ y: 2026, m: 7, d: 1 });
    expect(formatMonthDay('2026-07-01')).toBe('7/1');
    expect(formatYearMonth('2026-07-01')).toBe('2026年7月');
  });

  it('weekdayJa（2026-07-01 は水曜）', () => {
    expect(weekdayJa('2026-07-01')).toBe('水');
  });

  it('weekDatesMonday は月曜始まりの7日を返す', () => {
    const week = weekDatesMonday('2026-07-01');
    expect(week).toHaveLength(7);
    expect(week[0]).toBe('2026-06-29'); // その週の月曜
    expect(week).toContain('2026-07-01');
    expect(weekdayJa(week[0]!)).toBe('月');
  });

  it('monthGrid は先頭空白＋当月日数を返す（2026-07 は2つ空白＋31日）', () => {
    const cells = monthGrid('2026-07-01');
    expect(cells).toHaveLength(2 + 31);
    expect(cells[0]).toBeNull();
    expect(cells[2]).toBe('2026-07-01');
    expect(cells[cells.length - 1]).toBe('2026-07-31');
  });
});

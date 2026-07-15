import {
  formatMonthDay,
  formatYearMonth,
  isoWeekKey,
  monthGrid,
  todayISO,
  weekDatesMonday,
  weekdayJa,
  ymd,
} from '../date';

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

  describe('isoWeekKey（generateInsight の periodKey）', () => {
    it('同じ ISO 週の月曜と日曜は同じキーになる', () => {
      expect(isoWeekKey('2026-06-29')).toBe('2026-W27'); // 月
      expect(isoWeekKey('2026-07-05')).toBe('2026-W27'); // 日
      expect(isoWeekKey('2026-07-06')).toBe('2026-W28'); // 翌週の月
    });

    it('年またぎは週の年（木曜が属する年）に従う', () => {
      // 2026-01-01(木) は 2026-W01。直前の 2025-12-29(月) も同じ週。
      expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
      expect(isoWeekKey('2025-12-29')).toBe('2026-W01');
      // 2025-12-28(日) は前週（2025-W52）。
      expect(isoWeekKey('2025-12-28')).toBe('2025-W52');
    });

    it('53週まである年の年末は W53 を返す', () => {
      expect(isoWeekKey('2026-12-31')).toBe('2026-W53');
      // 翌年頭でも同じ週に属する日は W53 のまま。
      expect(isoWeekKey('2027-01-03')).toBe('2026-W53');
    });
  });
});

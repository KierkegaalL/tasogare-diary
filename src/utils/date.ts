// 端末ローカル日付（YYYY-MM-DD）。カレンダー突き合わせ用（data.md の date）。
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function ymd(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y ?? 0, m: m ?? 0, d: d ?? 0 };
}

// 「M/D」表記（entry-card 用）。
export function formatMonthDay(iso: string): string {
  const { m, d } = ymd(iso);
  return `${m}/${d}`;
}

// 「M月D日」表記（詳細ヘッダー用、visual-design.html .header-title）。
export function formatMonthDayJa(iso: string): string {
  const { m, d } = ymd(iso);
  return `${m}月${d}日`;
}

// 「M月D日(曜)」表記（ホームの日付ラベル、visual-design.html .date-label）。
export function formatDateLabel(iso: string): string {
  const { m, d } = ymd(iso);
  return `${m}月${d}日(${weekdayJa(iso)})`;
}

// 曜日（日本語1文字）。
export function weekdayJa(iso: string): string {
  const { y, m, d } = ymd(iso);
  return WEEKDAY_JA[new Date(y, m - 1, d).getDay()] ?? '';
}

// baseISO を含む週（月曜始まり）の7日分の ISO 日付。
export function weekDatesMonday(baseISO: string = todayISO()): string[] {
  const { y, m, d } = ymd(baseISO);
  const base = new Date(y, m - 1, d);
  const mondayOffset = (base.getDay() + 6) % 7; // 月曜からの経過日数
  const monday = new Date(y, m - 1, d - mondayOffset);
  return Array.from({ length: 7 }, (_, i) =>
    todayISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)),
  );
}

// baseISO の月のカレンダーグリッド（月曜始まり）。先頭の空白は null。
export function monthGrid(baseISO: string = todayISO()): (string | null)[] {
  const { y, m } = ymd(baseISO);
  const monthIndex = m - 1;
  const firstWeekday = (new Date(y, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, monthIndex + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let dd = 1; dd <= daysInMonth; dd++) cells.push(todayISO(new Date(y, monthIndex, dd)));
  return cells;
}

// 「YYYY年M月」表記（一覧の月区切り用）。
export function formatYearMonth(iso: string): string {
  const { y, m } = ymd(iso);
  return `${y}年${m}月`;
}

// ISO8601 の週キー（`YYYY-Www`）。generateInsight の periodKey に使う（api-contract.md 3.5）。
// ISO 週は月曜始まりで、週の年はその週の木曜日が属する年で決まる。
export function isoWeekKey(iso: string = todayISO()): string {
  const { y, m, d } = ymd(iso);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7; // 1(月)..7(日)
  // その週の木曜日へ寄せると、週の年と週番号が一意に決まる。
  const thursday = new Date(date.getTime() + (4 - dow) * 86400000);
  const weekYear = thursday.getUTCFullYear();
  const jan1 = Date.UTC(weekYear, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / (7 * 86400000)) + 1;
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

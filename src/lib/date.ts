const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  timeZone: "UTC",
});

const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const NUMBER_FORMATTER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function toUTCDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function formatMonth(month: string): string {
  const label = MONTH_FORMATTER.format(toUTCDate(`${month}-01`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatMonthShort(month: string): string {
  return MONTH_SHORT_FORMATTER.format(toUTCDate(`${month}-01`)).replace(".", "");
}

export function formatDateShort(date: string): string {
  return DAY_MONTH_FORMATTER.format(toUTCDate(date)).replace(".", "");
}

export function formatDateLong(date: string): string {
  return FULL_DATE_FORMATTER.format(toUTCDate(date));
}

export function formatBRL(cents: number): string {
  return CURRENCY_FORMATTER.format(cents / 100);
}

export function formatAmountInput(digits: string): string {
  if (!digits) return "";
  return NUMBER_FORMATTER.format(Number(digits) / 100);
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

export function relativeDueLabel(dueDate: string, today = todayISO()): string {
  const diff = daysBetween(today, dueDate);
  if (diff === 0) return "Vence hoje";
  if (diff === 1) return "Vence amanhã";
  if (diff > 1) return `Vence em ${diff} dias`;
  if (diff === -1) return "Venceu ontem";
  return `Venceu há ${Math.abs(diff)} dias`;
}

export function dueTone(dueDate: string, today = todayISO()): "today" | "late" | "soon" {
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return "late";
  if (diff === 0) return "today";
  return "soon";
}

export interface CalendarCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

export function buildCalendar(month: string): CalendarCell[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const daysInPrevious = new Date(Date.UTC(year, monthNumber - 1, 0)).getUTCDate();
  const today = todayISO();
  const cells: CalendarCell[] = [];
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  for (let index = 0; index < totalCells; index += 1) {
    const offset = index - firstWeekday + 1;
    const inMonth = offset >= 1 && offset <= daysInMonth;
    let day = offset;
    let cellMonth = month;

    if (offset < 1) {
      day = daysInPrevious + offset;
      cellMonth = addMonths(month, -1);
    } else if (offset > daysInMonth) {
      day = offset - daysInMonth;
      cellMonth = addMonths(month, 1);
    }

    const date = `${cellMonth}-${pad2(day)}`;
    cells.push({ date, day, inMonth, isToday: date === today });
  }

  return cells;
}

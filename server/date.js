const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function monthOf(date) {
  return date.slice(0, 7);
}

export function isMonth(value) {
  return typeof value === "string" && MONTH_RE.test(value);
}

export function isDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function daysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function dueDateForMonth(month, dueDay) {
  return `${month}-${pad2(Math.min(dueDay, daysInMonth(month)))}`;
}

export function addMonths(month, amount) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function monthRange(fromMonth, toMonth) {
  const months = [];
  let cursor = fromMonth;
  for (let guard = 0; cursor <= toMonth && guard < 240; guard += 1) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function diffDays(fromDate, toDate) {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

export function currentMonth() {
  return todayISO().slice(0, 7);
}

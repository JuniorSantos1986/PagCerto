import { Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, RotateCcw } from "lucide-react";
import {
  buildCalendar,
  formatBRL,
  formatDateLong,
  formatMonth,
  formatMonthShort,
  monthOf,
  todayISO,
  WEEKDAYS,
} from "../lib/date";
import type { Expense } from "../types";

interface CalendarPanelProps {
  month: string;
  expenses: Expense[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  readOnly?: boolean;
  busyId?: string | null;
  onTogglePaid?: (expense: Expense, date: string) => void;
}

export function CalendarPanel({
  month,
  expenses,
  selectedDate,
  onSelectDate,
  onPrevious,
  onNext,
  readOnly = false,
  busyId = null,
  onTogglePaid,
}: CalendarPanelProps) {
  const cells = buildCalendar(month);

  const pendingByDate = new Map<string, number>();
  const paidByDate = new Map<string, number>();

  for (const expense of expenses) {
    if (!expense.paid) {
      pendingByDate.set(
        expense.dueDate,
        (pendingByDate.get(expense.dueDate) ?? 0) + 1,
      );
    } else {
      const paidDate =
        expense.paidDate && monthOf(expense.paidDate) === month
          ? expense.paidDate
          : expense.dueDate;
      paidByDate.set(paidDate, (paidByDate.get(paidDate) ?? 0) + 1);
    }
  }

  const dayExpenses = selectedDate
    ? expenses
        .filter(
          (expense) =>
            expense.dueDate === selectedDate || expense.paidDate === selectedDate,
        )
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    : [];

  return (
    <section className="panel calendar-panel" aria-label="Calendário de pagamentos">
      <div className="calendar-title">
        <h2>Calendário de Pagamentos</h2>
      </div>

      <div className="calendar-nav">
        <button
          type="button"
          onClick={onPrevious}
          aria-label="Mês anterior"
          disabled={!onPrevious}
        >
          <ChevronLeft size={16} />
        </button>
        <span>{formatMonth(month).replace(" de ", " ").toLowerCase()}</span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Próximo mês"
          disabled={!onNext}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="calendar">
        <div className="weekday-row" aria-hidden="true">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((cell) => {
            const pending = pendingByDate.get(cell.date) ?? 0;
            const paid = paidByDate.get(cell.date) ?? 0;
            const isSelected = selectedDate === cell.date;
            const label = [
              formatDateLong(cell.date),
              pending > 0
                ? `${pending} despesa${pending === 1 ? "" : "s"} pendente${pending === 1 ? "" : "s"}`
                : "",
              paid > 0
                ? `${paid} pagamento${paid === 1 ? "" : "s"}`
                : "",
            ]
              .filter(Boolean)
              .join(", ");

            if (!cell.inMonth) {
              return (
                <div key={cell.date} className="calendar-day outside" aria-hidden="true">
                  <span>{cell.day}</span>
                </div>
              );
            }

            return (
              <button
                key={cell.date}
                type="button"
                className={`calendar-day ${cell.isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${pending > 0 ? "has-pending" : ""} ${paid > 0 ? "has-paid" : ""}`}
                onClick={() => onSelectDate(isSelected ? null : cell.date)}
                aria-label={label}
                aria-pressed={isSelected}
              >
                <span className="day-number">{cell.day}</span>
                <span className="day-dots" aria-hidden="true">
                  {Array.from({ length: Math.min(pending, 2) }).map((_, index) => (
                    <i key={`pending-${index}`} className="calendar-dot pending" />
                  ))}
                  {Array.from({ length: Math.min(paid, 2) }).map((_, index) => (
                    <i key={`paid-${index}`} className="calendar-dot paid" />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="legend calendar-legend" aria-label="Legenda">
        <span>
          <i className="legend-dot pending" /> Vencimento pendente
        </span>
        <span>
          <i className="legend-dot paid" /> Pago
        </span>
      </div>

      {selectedDate && (
        <div className="day-panel">
          <>
            <div className="day-panel-head">
              <div>
                <h3>{formatDateLong(selectedDate)}</h3>
                <p>
                  {selectedDate === todayISO()
                    ? "Hoje · "
                    : ""}
                  {dayExpenses.length === 0
                    ? "nenhuma despesa"
                    : `${dayExpenses.length} despesa${dayExpenses.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => onSelectDate(null)}
              >
                fechar
              </button>
            </div>

            {dayExpenses.length === 0 ? (
              <p className="day-empty">
                Nenhuma despesa vence ou foi paga neste dia.
              </p>
            ) : (
              <ul className="day-list">
                {dayExpenses.map((expense) => (
                  <li key={expense.id}>
                    <span
                      className={`day-status ${expense.paid ? "paid" : "pending"}`}
                      aria-hidden="true"
                    >
                      {expense.paid ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                    </span>
                    <span className="day-expense-main">
                      <span className="day-expense-name">{expense.name}</span>
                      <span className="day-expense-meta">
                        {formatBRL(expense.amountCents)}
                        {expense.paid && expense.paidDate
                          ? ` · pago em ${formatMonthShort(monthOf(expense.paidDate))} ${Number(expense.paidDate.slice(8, 10))}`
                          : ""}
                      </span>
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        className={`day-action ${expense.paid ? "undo" : ""}`}
                        onClick={() => onTogglePaid?.(expense, selectedDate)}
                        disabled={busyId === expense.id}
                        title={
                          expense.paid
                            ? "Desmarcar pagamento"
                            : `Marcar como paga nesta data`
                        }
                      >
                        {expense.paid ? <RotateCcw size={13} /> : <Check size={13} />}
                        <span>{expense.paid ? "desfazer" : "paguei"}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        </div>
      )}
    </section>
  );
}

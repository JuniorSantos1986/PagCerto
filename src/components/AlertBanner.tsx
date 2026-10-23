import { BellRing, Check } from "lucide-react";
import { categoryMeta } from "../lib/categories";
import { formatBRL, relativeDueLabel } from "../lib/date";
import type { UpcomingExpense } from "../types";

interface AlertBannerProps {
  expenses: UpcomingExpense[];
  onMarkPaid: (expense: UpcomingExpense) => void;
  busyId: string | null;
}

export function AlertBanner({ expenses, onMarkPaid, busyId }: AlertBannerProps) {
  if (expenses.length === 0) return null;

  const overdue = expenses.filter((expense) => expense.daysUntil < 0).length;

  return (
    <section className="alert-panel" aria-label="Alertas de vencimento">
      <div className="alert-head">
        <span className="alert-icon" aria-hidden="true">
          <BellRing size={19} />
        </span>
        <div>
          <strong>Fique de olho nos vencimentos</strong>
          <p>
            {overdue > 0
              ? `${overdue} despesa${overdue === 1 ? "" : "s"} vencida${overdue === 1 ? "" : "s"} e `
              : ""}
            {expenses.length > overdue
              ? `${expenses.length - overdue} vencendo nos próximos 5 dias`
              : "nada vencendo nos próximos 5 dias"}
          </p>
        </div>
      </div>

      <ul className="alert-list">
        {expenses.map((expense) => {
          const category = categoryMeta(expense.category);
          return (
            <li key={expense.id} className="alert-item">
              <span
                className="alert-category"
                style={{ background: category.tint, color: category.color }}
                aria-hidden="true"
              >
                {category.label.slice(0, 1)}
              </span>
              <span className="alert-main">
                <span className="alert-name">{expense.name}</span>
                <span className="alert-meta">
                  {category.label} · {formatBRL(expense.amountCents)}
                </span>
              </span>
              <span
                className={`due-pill ${expense.daysUntil < 0 ? "late" : expense.daysUntil === 0 ? "today" : "soon"}`}
              >
                {relativeDueLabel(expense.dueDate)}
              </span>
              <button
                type="button"
                className="alert-action"
                onClick={() => onMarkPaid(expense)}
                disabled={busyId === expense.id}
              >
                <Check size={14} />
                <span>{busyId === expense.id ? "Salvando…" : "Marcar pago"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Inbox,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
} from "lucide-react";
import { CATEGORIES, categoryMeta } from "../lib/categories";
import {
  daysBetween,
  formatBRL,
  formatDateShort,
  relativeDueLabel,
  todayISO,
} from "../lib/date";
import type { Expense, Filter } from "../types";

interface ExpenseListProps {
  expenses: Expense[];
  readOnly?: boolean;
  busyId?: string | null;
  onTogglePaid?: (expense: Expense) => void;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
  onCreate?: () => void;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "pending", label: "Pendentes" },
  { id: "paid", label: "Pagas" },
];

export function ExpenseList({
  expenses,
  readOnly = false,
  busyId = null,
  onTogglePaid,
  onEdit,
  onDelete,
  onCreate,
}: ExpenseListProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const counts = {
    all: expenses.length,
    pending: expenses.filter((expense) => !expense.paid).length,
    paid: expenses.filter((expense) => expense.paid).length,
  };

  const term = query.trim().toLocaleLowerCase("pt-BR");
  const visible = expenses
    .filter((expense) => {
      if (filter === "pending") return !expense.paid;
      if (filter === "paid") return expense.paid;
      return true;
    })
    .filter((expense) => category === "all" || expense.category === category)
    .filter(
      (expense) =>
        term === "" || expense.name.toLocaleLowerCase("pt-BR").includes(term),
    );

  return (
    <section className="panel expenses-panel" aria-label="Lista de despesas">
      <h2 className="sr-only">Despesas do mês</h2>

      <div className="expense-toolbar">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar despesa..."
            aria-label="Buscar despesa"
          />
        </label>
        <select
          className="category-filter"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Filtrar por categoria"
        >
          <option value="all">Todas categorias</option>
          {CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-tabs" role="tablist" aria-label="Filtrar despesas">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={`filter-tab ${filter === item.id ? "active" : ""}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Inbox size={24} />
          </span>
          <h3>Nenhuma despesa para este filtro.</h3>
          {counts.all > 0 && (
            <p>Ajuste a busca ou os filtros para ver outras despesas.</p>
          )}
          {counts.all === 0 && readOnly && (
            <p>O responsável ainda não cadastrou despesas para este mês.</p>
          )}
          {counts.all === 0 && !readOnly && onCreate && (
            <button type="button" className="button button-primary" onClick={onCreate}>
              <Plus size={15} />
              Adicionar primeira despesa
            </button>
          )}
        </div>
      ) : (
        <ul className="expense-list">
          {visible.map((expense) => {
            const category = categoryMeta(expense.category);
            const isOverdue = !expense.paid && expense.dueDate < todayISO();
            const overdueDays = isOverdue
              ? Math.abs(daysBetween(todayISO(), expense.dueDate))
              : 0;

            return (
              <li
                key={expense.id}
                className={`expense-row ${expense.paid ? "is-paid" : "is-pending"}`}
              >
                {readOnly ? (
                  <span
                    className={`pay-indicator ${expense.paid ? "paid" : "pending"}`}
                    title={expense.paid ? "Paga" : "Pendente"}
                  >
                    {expense.paid ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`pay-toggle ${expense.paid ? "paid" : "pending"}`}
                    onClick={() => onTogglePaid?.(expense)}
                    disabled={busyId === expense.id}
                    aria-label={
                      expense.paid
                        ? `Desmarcar ${expense.name} como paga`
                        : `Marcar ${expense.name} como paga`
                    }
                    title={expense.paid ? "Marcar como pendente" : "Marcar como paga"}
                  >
                    {expense.paid ? <CheckCircle2 size={21} /> : <Circle size={21} />}
                  </button>
                )}

                <div className="expense-main">
                  <div className="expense-title-row">
                    <span className="expense-name">{expense.name}</span>
                    <span
                      className="category-badge"
                      style={{ background: category.tint, color: category.color }}
                    >
                      {category.label}
                    </span>
                    {expense.isRecurring && (
                      <span
                        className="recurring-icon"
                        title="Despesa recorrente"
                        aria-label="Despesa recorrente"
                      >
                        <Repeat2 size={13} />
                      </span>
                    )}
                  </div>
                  <div className="expense-meta">
                    {expense.paid ? (
                      <>
                        <span className="paid-text">
                          Paga em {formatDateShort(expense.paidDate ?? expense.dueDate)}
                        </span>
                        <span className="meta-divider">·</span>
                        <span>venceu em {formatDateShort(expense.dueDate)}</span>
                      </>
                    ) : (
                      <>
                        <span>Vence em {formatDateShort(expense.dueDate)}</span>
                        <span className="meta-divider">·</span>
                        <span className={isOverdue ? "overdue-text" : "due-text"}>
                          {isOverdue
                            ? `atrasada há ${overdueDays} dia${overdueDays === 1 ? "" : "s"}`
                            : relativeDueLabel(expense.dueDate).toLowerCase()}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <span
                  className={`expense-amount ${expense.paid ? "paid-text" : "pending-text"}`}
                >
                  {formatBRL(expense.amountCents)}
                </span>

                {!readOnly && (
                  <div className="expense-actions">
                    <button
                      type="button"
                      className="icon-button subtle"
                      onClick={() => onEdit?.(expense)}
                      aria-label={`Editar ${expense.name}`}
                      title="Editar"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button subtle danger"
                      onClick={() => onDelete?.(expense)}
                      aria-label={`Excluir ${expense.name}`}
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

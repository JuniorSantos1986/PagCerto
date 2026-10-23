import { useState, type FormEvent } from "react";
import { AlertCircle, CalendarDays, Repeat2 } from "lucide-react";
import { CATEGORIES } from "../lib/categories";
import { formatAmountInput, todayISO } from "../lib/date";
import type { CategoryId, Expense, ExpenseInput } from "../types";
import { Modal } from "./Modal";

interface ExpenseModalProps {
  expense: Expense | null;
  defaultDate?: string;
  onClose: () => void;
  onSave: (input: ExpenseInput) => Promise<void>;
}

export function ExpenseModal({
  expense,
  defaultDate,
  onClose,
  onSave,
}: ExpenseModalProps) {
  const [name, setName] = useState(expense?.name ?? "");
  const [amountDigits, setAmountDigits] = useState(
    expense ? String(expense.amountCents) : "",
  );
  const [category, setCategory] = useState<CategoryId>(
    expense?.category ?? "outros",
  );
  const [dueDate, setDueDate] = useState(
    expense?.dueDate ?? defaultDate ?? todayISO(),
  );
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(expense);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const amountCents = Number(amountDigits);

    if (trimmedName.length === 0) {
      setError("Dê um nome para a despesa.");
      return;
    }
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    if (!dueDate) {
      setError("Escolha a data de vencimento.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: trimmedName,
        amountCents,
        category,
        dueDate,
        recurring: isEditing ? undefined : recurring,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar a despesa.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEditing ? "Editar despesa" : "Nova despesa"}
      subtitle={
        isEditing
          ? "Atualize os dados desta despesa."
          : "Preencha os dados para incluir no mês."
      }
      onClose={onClose}
    >
      <form className="expense-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Nome</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Aluguel, Internet, Mercado"
            maxLength={80}
            autoFocus
            required
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Valor</span>
            <span className="currency-input">
              <span className="currency-prefix">R$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatAmountInput(amountDigits)}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
                  setAmountDigits(digits);
                }}
                placeholder="0,00"
                required
              />
            </span>
          </label>

          <label className="field">
            <span>Vencimento</span>
            <span className="date-input">
              <CalendarDays size={16} aria-hidden="true" />
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required
              />
            </span>
          </label>
        </div>

        <label className="field">
          <span>Categoria</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as CategoryId)}
          >
            {CATEGORIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {!isEditing && (
          <label className={`recurring-option ${recurring ? "checked" : ""}`}>
            <input
              type="checkbox"
              checked={recurring}
              onChange={(event) => setRecurring(event.target.checked)}
            />
            <span className="recurring-icon-box" aria-hidden="true">
              <Repeat2 size={16} />
            </span>
            <span className="recurring-copy">
              <strong>Repetir todo mês</strong>
              <span>A despesa será criada automaticamente nos próximos meses.</span>
            </span>
          </label>
        )}

        {isEditing && expense?.isRecurring && (
          <p className="form-note">
            <Repeat2 size={14} />
            Esta é uma despesa recorrente. As alterações valem para este mês e para
            os próximos.
          </p>
        )}

        {error && (
          <p className="form-error" role="alert">
            <AlertCircle size={15} />
            {error}
          </p>
        )}

        <div className="modal-footer">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving
              ? "Salvando…"
              : isEditing
                ? "Salvar alterações"
                : "Adicionar despesa"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

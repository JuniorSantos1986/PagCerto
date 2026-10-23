import { useState } from "react";
import { AlertTriangle, CalendarX2, Repeat2, Trash2 } from "lucide-react";
import { formatBRL } from "../lib/date";
import type { Expense } from "../types";
import { Modal } from "./Modal";

interface DeleteDialogProps {
  expense: Expense;
  onClose: () => void;
  onConfirm: (scope: "single" | "series") => Promise<void>;
}

export function DeleteDialog({ expense, onClose, onConfirm }: DeleteDialogProps) {
  const [busy, setBusy] = useState<"single" | "series" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(scope: "single" | "series") {
    setError(null);
    setBusy(scope);
    try {
      await onConfirm(scope);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível excluir a despesa.",
      );
      setBusy(null);
    }
  }

  return (
    <Modal
      title="Excluir despesa?"
      subtitle="Essa ação não pode ser desfeita."
      onClose={onClose}
      size="sm"
      accent="danger"
    >
      <div className="delete-summary">
        <span className="delete-icon" aria-hidden="true">
          <AlertTriangle size={19} />
        </span>
        <div>
          <strong>{expense.name}</strong>
          <span>
            {formatBRL(expense.amountCents)} · vence em{" "}
            {expense.dueDate.split("-").reverse().join("/")}
          </span>
        </div>
      </div>

      {expense.isRecurring ? (
        <>
          <p className="delete-description">
            Esta despesa se repete todo mês. O que você quer fazer?
          </p>
          <div className="delete-options">
            <button
              type="button"
              className="delete-option"
              onClick={() => handleDelete("single")}
              disabled={busy !== null}
            >
              <span className="delete-option-icon">
                <CalendarX2 size={17} />
              </span>
              <span>
                <strong>Somente este mês</strong>
                <span>A recorrência continua nos próximos meses.</span>
              </span>
              {busy === "single" && <span className="spinner" />}
            </button>

            <button
              type="button"
              className="delete-option danger"
              onClick={() => handleDelete("series")}
              disabled={busy !== null}
            >
              <span className="delete-option-icon">
                <Repeat2 size={17} />
              </span>
              <span>
                <strong>Encerrar recorrência</strong>
                <span>Remove esta e as próximas cobranças.</span>
              </span>
              {busy === "series" && <span className="spinner" />}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="delete-description">
            A despesa <strong>{expense.name}</strong> será removida do seu histórico
            deste mês.
          </p>
          <div className="modal-footer">
            <button type="button" className="button button-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => handleDelete("single")}
              disabled={busy !== null}
            >
              <Trash2 size={16} />
              {busy ? "Excluindo…" : "Excluir despesa"}
            </button>
          </div>
        </>
      )}

      {expense.isRecurring && (
        <button type="button" className="text-button centered" onClick={onClose}>
          cancelar
        </button>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

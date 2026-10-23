import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, ServerCrash } from "lucide-react";
import { api } from "../lib/api";
import {
  addMonths,
  currentMonth,
  monthOf,
  todayISO,
} from "../lib/date";
import { useTheme } from "../lib/useTheme";
import type { Expense, ExpenseInput, Summary, UpcomingExpense } from "../types";
import { AlertBanner } from "../components/AlertBanner";
import { AppHeader } from "../components/AppHeader";
import { CalendarPanel } from "../components/CalendarPanel";
import { DeleteDialog } from "../components/DeleteDialog";
import { ExpenseList } from "../components/ExpenseList";
import { ExpenseModal } from "../components/ExpenseModal";
import { ShareModal } from "../components/ShareModal";
import { SummaryStrip } from "../components/SummaryStrip";
import { Toast, type ToastData } from "../components/Toast";

type ModalState =
  | { type: "create"; defaultDate: string }
  | { type: "edit"; expense: Expense }
  | null;

export function Dashboard() {
  const { theme, toggleTheme } = useTheme();
  const [month, setMonth] = useState(currentMonth());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const requestRef = useRef(0);

  const notify = useCallback((message: string, tone: ToastData["tone"] = "success") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadMonth = useCallback(async (targetMonth: string, silent = false) => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const [expenseResult, summaryResult, upcomingResult] = await Promise.all([
        api.getExpenses(targetMonth),
        api.getSummary(targetMonth),
        api.getUpcoming(5),
      ]);
      if (requestRef.current !== request) return;
      setExpenses(expenseResult.expenses);
      setSummary(summaryResult);
      setUpcoming(upcomingResult.expenses);
    } catch (cause) {
      if (requestRef.current !== request) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar seus dados.",
      );
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMonth(month);
  }, [loadMonth, month]);

  useEffect(() => {
    setSelectedDate(null);
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    api
      .getShareToken()
      .then((result) => {
        if (!cancelled) setShareToken(result.token);
      })
      .catch(() => {
        // o link pode ser criado depois, sem bloquear o app
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function goToMonth(delta: number) {
    setMonth((current) => addMonths(current, delta));
  }

  function goToToday() {
    setMonth(currentMonth());
  }

  function openCreate() {
    const defaultDate =
      selectedDate && monthOf(selectedDate) === month
        ? selectedDate
        : month === currentMonth()
          ? todayISO()
          : `${month}-01`;
    setModal({ type: "create", defaultDate });
  }

  async function handleSave(input: ExpenseInput) {
    if (modal?.type === "edit") {
      await api.updateExpense(modal.expense.id, input);
      notify("Despesa atualizada.", "success");
    } else {
      await api.createExpense(input);
      notify("Despesa adicionada.", "success");
    }

    setModal(null);
    const targetMonth = monthOf(input.dueDate);
    if (targetMonth !== month) {
      setMonth(targetMonth);
    } else {
      await loadMonth(month, true);
    }
  }

  async function handleTogglePaid(expense: Expense, date?: string) {
    setBusyId(expense.id);
    try {
      await api.setPaid(expense.id, !expense.paid, expense.paid ? undefined : date);
      if (expense.paid) {
        notify("Despesa marcada como pendente.", "info");
      } else {
        notify(
          date
            ? "Pagamento registrado nesta data."
            : "Despesa marcada como paga.",
          "success",
        );
      }
      await loadMonth(month, true);
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Não foi possível atualizar a despesa.",
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(scope: "single" | "series") {
    if (!deleteTarget) return;
    await api.deleteExpense(deleteTarget.id, scope);
    setDeleteTarget(null);
    notify(
      scope === "series" ? "Recorrência encerrada." : "Despesa excluída.",
      "success",
    );
    await loadMonth(month, true);
  }

  async function handleAlertPaid(expense: UpcomingExpense) {
    setBusyId(expense.id);
    try {
      await api.setPaid(expense.id, true, todayISO());
      notify(`“${expense.name}” marcada como paga.`, "success");
      await loadMonth(month, true);
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Não foi possível marcar como paga.",
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient" aria-hidden="true" />

      <AppHeader
        month={month}
        onPrevious={() => goToMonth(-1)}
        onNext={() => goToMonth(1)}
        onToday={goToToday}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNewExpense={openCreate}
        onShare={() => setShareOpen(true)}
      />

      <main className="app-main">
        {error ? (
          <div className="state-panel error-state">
            <span className="state-icon">
              <ServerCrash size={24} />
            </span>
            <h2>Não foi possível carregar</h2>
            <p>{error}</p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void loadMonth(month)}
            >
              <RefreshCw size={15} />
              Tentar novamente
            </button>
          </div>
        ) : loading ? (
          <div className="state-panel loading-state">
            <span className="spinner large" />
            <p>Carregando seu mês…</p>
          </div>
        ) : (
          <>
            <AlertBanner
              expenses={upcoming}
              onMarkPaid={handleAlertPaid}
              busyId={busyId}
            />
            <SummaryStrip summary={summary} />
            <div className="content-grid">
              <ExpenseList
                expenses={expenses}
                busyId={busyId}
                onTogglePaid={(expense) => void handleTogglePaid(expense)}
                onEdit={(expense) => setModal({ type: "edit", expense })}
                onDelete={setDeleteTarget}
                onCreate={openCreate}
              />
              <CalendarPanel
                month={month}
                expenses={expenses}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onPrevious={() => goToMonth(-1)}
                onNext={() => goToMonth(1)}
                busyId={busyId}
                onTogglePaid={(expense, date) => void handleTogglePaid(expense, date)}
              />
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <span>PagCerto · suas despesas, no seu ritmo.</span>
        <span>Dados salvos localmente</span>
      </footer>

      {modal?.type === "create" && (
        <ExpenseModal
          expense={null}
          defaultDate={modal.defaultDate}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {modal?.type === "edit" && (
        <ExpenseModal
          expense={modal.expense}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {deleteTarget && (
        <DeleteDialog
          expense={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      {shareOpen && (
        <ShareModal
          token={shareToken}
          onClose={() => setShareOpen(false)}
          onTokenChange={setShareToken}
          onNotify={notify}
        />
      )}

      {toast && <Toast key={toast.id} toast={toast} />}
    </div>
  );
}

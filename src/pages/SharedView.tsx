import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Link2Off, Moon, RefreshCw, Sun } from "lucide-react";
import { ApiError, api } from "../lib/api";
import {
  addMonths,
  currentMonth,
} from "../lib/date";
import { useTheme } from "../lib/useTheme";
import type { Expense, Summary } from "../types";
import { AppHeader, Brand } from "../components/AppHeader";
import { CalendarPanel } from "../components/CalendarPanel";
import { ExpenseList } from "../components/ExpenseList";
import { SummaryStrip } from "../components/SummaryStrip";

export function SharedView({ token }: { token: string }) {
  const { theme, toggleTheme } = useTheme();
  const [month, setMonth] = useState(currentMonth());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadMonth = useCallback(
    async (targetMonth: string) => {
      const request = requestRef.current + 1;
      requestRef.current = request;
      setLoading(true);
      setError(null);

      try {
        const [expenseResult, summaryResult] = await Promise.all([
          api.getSharedExpenses(token, targetMonth),
          api.getSharedSummary(token, targetMonth),
        ]);
        if (requestRef.current !== request) return;
        setExpenses(expenseResult.expenses);
        setSummary(summaryResult);
      } catch (cause) {
        if (requestRef.current !== request) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setInvalid(true);
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar as despesas.",
        );
      } finally {
        if (requestRef.current === request) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void loadMonth(month);
  }, [loadMonth, month]);

  useEffect(() => {
    setSelectedDate(null);
  }, [month]);

  if (invalid) {
    return (
      <div className="app-shell">
        <div className="ambient" aria-hidden="true" />
        <header className="app-header shared-simple-header">
          <Brand readOnly />
          <div className="header-actions">
            <button
              type="button"
              className="icon-button theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main className="app-main">
          <div className="state-panel invalid-state">
            <span className="state-icon">
              <Link2Off size={25} />
            </span>
            <h1>Link inválido</h1>
            <p>
              Este link de compartilhamento foi desativado ou não existe. Peça um
              novo link para quem compartilhou as despesas com você.
            </p>
          </div>
        </main>
        <footer className="app-footer">
          <span>Gestor · despesas mensais</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="ambient" aria-hidden="true" />

      <AppHeader
        month={month}
        onPrevious={() => setMonth((current) => addMonths(current, -1))}
        onNext={() => setMonth((current) => addMonths(current, 1))}
        onToday={() => setMonth(currentMonth())}
        theme={theme}
        onToggleTheme={toggleTheme}
        readOnly
      />

      <main className="app-main">
        <div className="readonly-banner">
          <Eye size={16} />
          <span>
            <strong>Visualização somente leitura.</strong> Você pode navegar pelos
            meses, mas não editar as despesas.
          </span>
        </div>

        {error ? (
          <div className="state-panel error-state">
            <span className="state-icon">
              <RefreshCw size={24} />
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
            <p>Carregando despesas…</p>
          </div>
        ) : (
          <>
            <SummaryStrip summary={summary} />
            <div className="content-grid">
              <ExpenseList expenses={expenses} readOnly />
              <CalendarPanel
                month={month}
                expenses={expenses}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onPrevious={() => setMonth((current) => addMonths(current, -1))}
                onNext={() => setMonth((current) => addMonths(current, 1))}
                readOnly
              />
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <span>Gestor · visualização compartilhada</span>
        <span>Somente leitura</span>
      </footer>
    </div>
  );
}

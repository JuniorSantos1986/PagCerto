import {
  ChevronLeft,
  ChevronRight,
  Moon,
  Plus,
  Share2,
  Sun,
} from "lucide-react";
import logoUrl from "../assets/PagCerto-Logo-Completo.svg";
import { currentMonth, formatMonth } from "../lib/date";

interface AppHeaderProps {
  month: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onNewExpense?: () => void;
  onShare?: () => void;
  readOnly?: boolean;
}

export function AppHeader({
  month,
  onPrevious,
  onNext,
  onToday,
  theme,
  onToggleTheme,
  onNewExpense,
  onShare,
  readOnly = false,
}: AppHeaderProps) {
  const isCurrent = month === currentMonth();
  const label = formatMonth(month).replace(" de ", " ");
  const year = label.slice(label.lastIndexOf(" ") + 1);
  const monthName = label.slice(0, label.lastIndexOf(" "));

  return (
    <header className="app-header">
      <div className="header-top">
        <Brand readOnly={readOnly} showCaption={false} />

        <div className="header-actions">
          {!readOnly && onShare && (
            <button
              type="button"
              className="button button-ghost"
              onClick={onShare}
              title="Compartilhar"
              aria-label="Compartilhar"
            >
              <Share2 size={15} />
              <span>Compartilhar</span>
            </button>
          )}

          <button
            type="button"
            className="icon-button theme-toggle"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            title={theme === "dark" ? "Tema claro" : "Tema escuro"}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </div>

      <div className="month-bar">
        <div className="month-switcher" aria-label="Navegação por mês">
          <button
            type="button"
            className="icon-button month-arrow"
            onClick={onPrevious}
            aria-label="Mês anterior"
          >
            <ChevronLeft size={17} />
          </button>
          <div className="month-label">
            <span className="month-name">{monthName}</span>
            <small className="month-year">{year}</small>
            {!isCurrent && (
              <button type="button" className="today-link" onClick={onToday}>
                voltar para hoje
              </button>
            )}
          </div>
          <button
            type="button"
            className="icon-button month-arrow"
            onClick={onNext}
            aria-label="Próximo mês"
          >
            <ChevronRight size={17} />
          </button>
        </div>

        <span className="month-caption">
          {readOnly ? "visualização compartilhada" : "Controle Mensal"}
        </span>

        {!readOnly && onNewExpense && (
          <button
            type="button"
            className="button button-primary add-expense-button"
            onClick={onNewExpense}
            title="Adicionar despesa"
          >
            <Plus size={16} />
            <span>Adicionar despesa</span>
          </button>
        )}
      </div>
    </header>
  );
}

export function Brand({
  readOnly = false,
  showCaption = true,
}: {
  readOnly?: boolean;
  showCaption?: boolean;
}) {
  return (
    <div className="brand">
      <span className="brand-copy">
        <img
          className="brand-logo"
          src={logoUrl}
          alt="PagCerto — controle financeiro"
        />
        {showCaption && (
          <span className="brand-sub">
            {readOnly ? "visualização compartilhada" : "Controle Mensal"}
          </span>
        )}
      </span>
      {readOnly && <span className="readonly-badge">somente leitura</span>}
    </div>
  );
}

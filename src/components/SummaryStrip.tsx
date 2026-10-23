import { CheckCircle2, TrendingUp, Wallet, Clock3 } from "lucide-react";
import { formatBRL } from "../lib/date";
import type { Summary } from "../types";

interface SummaryStripProps {
  summary: Summary | null;
}

export function SummaryStrip({ summary }: SummaryStripProps) {
  const total = summary?.totalCents ?? 0;
  const paid = summary?.paidCents ?? 0;
  const pending = summary?.pendingCents ?? 0;
  const percent = total > 0 ? Math.round((paid / total) * 100) : 0;

  return (
    <section className="summary-strip" aria-label="Resumo do mês">
      <article className="summary-card">
        <div className="summary-top">
          <span className="summary-label">Total do mês</span>
          <span className="summary-icon blue" aria-hidden="true">
            <Wallet size={17} />
          </span>
        </div>
        <strong className="summary-value">{formatBRL(total)}</strong>
      </article>

      <article className="summary-card">
        <div className="summary-top">
          <span className="summary-label">Total pago</span>
          <span className="summary-icon green" aria-hidden="true">
            <CheckCircle2 size={17} />
          </span>
        </div>
        <strong className="summary-value paid-text">{formatBRL(paid)}</strong>
      </article>

      <article className="summary-card">
        <div className="summary-top">
          <span className="summary-label">Total pendente</span>
          <span className="summary-icon red" aria-hidden="true">
            <Clock3 size={17} />
          </span>
        </div>
        <strong className="summary-value pending-text">{formatBRL(pending)}</strong>
      </article>

      <article className="summary-card progress-card">
        <div className="summary-top">
          <span className="summary-label">Progresso de quitação</span>
          <span className="summary-icon blue" aria-hidden="true">
            <TrendingUp size={17} />
          </span>
        </div>
        <strong className="summary-value progress-percent">{percent}%</strong>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Percentual de despesas pagas"
        >
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </article>
    </section>
  );
}

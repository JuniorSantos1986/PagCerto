import type {
  Expense,
  ExpenseInput,
  Summary,
  UpcomingExpense,
} from "../types";

interface ApiErrorBody {
  error?: string;
}

const API_BASE = String(import.meta.env.VITE_API_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = "Não foi possível concluir a ação.";
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body.error) message = body.error;
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export const api = {
  getExpenses(month: string) {
    return request<{ month: string; expenses: Expense[] }>(
      `/api/expenses?month=${month}`,
    );
  },

  getSummary(month: string) {
    return request<Summary>(`/api/summary?month=${month}`);
  },

  getUpcoming(days = 5) {
    return request<{ days: number; expenses: UpcomingExpense[] }>(
      `/api/upcoming?days=${days}`,
    );
  },

  createExpense(input: ExpenseInput) {
    return request<{ expense: Expense }>("/api/expenses", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateExpense(id: string, input: ExpenseInput) {
    return request<{ expense: Expense }>(`/api/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  setPaid(id: string, paid: boolean, paidDate?: string) {
    return request<{ expense: Expense }>(`/api/expenses/${id}/pay`, {
      method: "PATCH",
      body: JSON.stringify({ paid, paidDate }),
    });
  },

  deleteExpense(id: string, scope: "single" | "series" = "single") {
    return request<{ deleted: unknown }>(
      `/api/expenses/${id}?scope=${scope}`,
      { method: "DELETE" },
    );
  },

  getShareToken() {
    return request<{ token: string | null }>("/api/share");
  },

  createShareToken() {
    return request<{ token: string }>("/api/share", { method: "POST" });
  },

  revokeShareToken() {
    return request<{ ok: boolean }>("/api/share", { method: "DELETE" });
  },

  getSharedExpenses(token: string, month: string) {
    return request<{ month: string; expenses: Expense[] }>(
      `/api/shared/${encodeURIComponent(token)}/expenses?month=${month}`,
    );
  },

  getSharedSummary(token: string, month: string) {
    return request<Summary>(
      `/api/shared/${encodeURIComponent(token)}/summary?month=${month}`,
    );
  },
};

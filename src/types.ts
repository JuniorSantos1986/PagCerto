export type CategoryId =
  | "moradia"
  | "alimentacao"
  | "transporte"
  | "saude"
  | "educacao"
  | "lazer"
  | "contas"
  | "assinaturas"
  | "outros";

export interface Expense {
  id: string;
  name: string;
  amountCents: number;
  category: CategoryId;
  dueDate: string;
  month: string;
  paid: boolean;
  paidDate: string | null;
  recurringId: string | null;
  isRecurring: boolean;
}

export interface UpcomingExpense extends Expense {
  daysUntil: number;
}

export interface Summary {
  month: string;
  totalCount: number;
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  paidCount: number;
  pendingCount: number;
}

export interface ExpenseInput {
  name: string;
  amountCents: number;
  category: CategoryId;
  dueDate: string;
  recurring?: boolean;
}

export type Filter = "all" | "pending" | "paid";

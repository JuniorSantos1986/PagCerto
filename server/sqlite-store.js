import {
  createExpense,
  createShareToken,
  deleteExpense,
  getExpense,
  getMonthList,
  getShareToken,
  getSummary,
  getUpcoming,
  isValidShareToken,
  listExpenses,
  revokeShareTokens,
  setPaid,
  updateExpense,
} from "./expenses.js";

export function createSqliteStore(db) {
  return {
    async getExpense(id) {
      return getExpense(db, id);
    },
    async listExpenses(month) {
      return listExpenses(db, month);
    },
    async getSummary(month) {
      return getSummary(db, month);
    },
    async getUpcoming(days) {
      return getUpcoming(db, days);
    },
    async createExpense(input) {
      return createExpense(db, input);
    },
    async updateExpense(id, input) {
      return updateExpense(db, id, input);
    },
    async setPaid(id, paid, paidDate) {
      return setPaid(db, id, paid, paidDate);
    },
    async deleteExpense(id, scope) {
      return deleteExpense(db, id, scope);
    },
    async getShareToken() {
      return getShareToken(db);
    },
    async createShareToken() {
      return createShareToken(db);
    },
    async revokeShareTokens() {
      return revokeShareTokens(db);
    },
    async isValidShareToken(token) {
      return isValidShareToken(db, token);
    },
    async getMonthList() {
      return getMonthList(db);
    },
  };
}

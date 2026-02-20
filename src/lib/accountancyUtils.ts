import type { Expense, Income } from './types';

/** Сумма по расходу: количество × стоимость (для старых записей quantity = 1). */
export function getExpenseSum(e: Expense): number {
    return (e.quantity ?? 1) * (e.amount ?? 0);
}

/** Сумма по доходу: количество × стоимость (для старых записей quantity = 1). */
export function getIncomeSum(i: Income): number {
    return (i.quantity ?? 1) * (i.amount ?? 0);
}

import { resolveCategoryName } from '@/lib/accountancyCategoryResolve';
import {
    HOLY_COW_EXPENSE_SHARE_INCOME_CATEGORY_ID,
    isExcludedCommissionCalcExpenseCategoryId,
    isHolyCowExpenseShareIncomeCategoryId,
} from '@/lib/accountancyCategoryIds';
import { HOLY_COW_EXPENSE_SHARE_AUTO_CATEGORY } from '@/lib/accountancyOperationGroupCategoryOrder';
import { getExpenseSum, getIncomeSum } from '@/lib/accountancyUtils';
import { normalizeMongoIdString } from '@/lib/mongoId';
import type { Expense, Income } from '@/lib/types';

export { HOLY_COW_EXPENSE_SHARE_INCOME_CATEGORY_ID, isHolyCowExpenseShareIncomeCategoryId } from '@/lib/accountancyCategoryIds';

export function isHolyCowExpenseShareIncomeCategory(
    categoryId: string | null | undefined,
    categoryName: string,
): boolean {
    if (isHolyCowExpenseShareIncomeCategoryId(categoryId)) return true;
    const trimmed = categoryName.trim();
    return (
        trimmed === HOLY_COW_EXPENSE_SHARE_AUTO_CATEGORY ||
        trimmed === 'Доля расходов Holy Cow Phuket' ||
        trimmed === 'Доля расходов HC'
    );
}

function isExcludedHolyCowSourceExpense(categoryId: string | null | undefined): boolean {
    return isExcludedCommissionCalcExpenseCategoryId(categoryId);
}

function addSubtransactionTotal(map: Map<string, number>, parentId: string, amount: number): void {
    if (!parentId || amount === 0) return;
    map.set(parentId, (map.get(parentId) ?? 0) + amount);
}

export type ParentSubtransactionTotals = {
    childExpenseByParentId: Map<string, number>;
    childIncomeByParentId: Map<string, number>;
};

/** Суммы подтранзакций (расходы и приходы с parentExpenseId) по id родительского расхода. */
export function buildParentSubtransactionTotals(
    expenses: Expense[],
    incomes: Income[],
    matchesRecord: (record: Expense | Income) => boolean,
    categoryNameById: Map<string, string>,
): ParentSubtransactionTotals {
    const childExpenseByParentId = new Map<string, number>();
    const childIncomeByParentId = new Map<string, number>();

    for (const child of expenses) {
        if (!matchesRecord(child)) continue;
        const parentId = normalizeMongoIdString(child.parentExpenseId).trim();
        if (!parentId) continue;
        if (isExcludedHolyCowSourceExpense(child.categoryId)) continue;
        addSubtransactionTotal(childExpenseByParentId, parentId, getExpenseSum(child));
    }

    for (const child of incomes) {
        if (!matchesRecord(child)) continue;
        const parentId = normalizeMongoIdString(child.parentExpenseId).trim();
        if (!parentId) continue;
        addSubtransactionTotal(childIncomeByParentId, parentId, getIncomeSum(child));
    }

    return { childExpenseByParentId, childIncomeByParentId };
}

export function commissionSubtransactionTotalForParent(
    parentEntityId: string,
    totals: ParentSubtransactionTotals,
): number {
    const id = normalizeMongoIdString(parentEntityId).trim();
    if (!id) return 0;
    return (
        (totals.childExpenseByParentId.get(id) ?? 0) +
        (totals.childIncomeByParentId.get(id) ?? 0)
    );
}

/** Доля Holy Cow: (сумма − подтранзакции) × % комиссии. */
export function holyCowShareFromLineTotal(
    lineTotalAbs: number,
    subtransactionTotal: number,
    percent: number,
): number {
    const base = Math.max(0, lineTotalAbs - subtransactionTotal);
    return base * (percent / 100);
}

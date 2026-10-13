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
    /** Приходы-подтранзакции кроме «Доля расходов HC». */
    childIncomeByParentId: Map<string, number>;
    /** Приходы «Доля расходов HC» (по categoryId) — явная доля агентства. */
    holyCowExpenseShareByParentId: Map<string, number>;
};

/** Суммы подтранзакций (расходы и приходы с parentExpenseId) по id родительского расхода. */
export function buildParentSubtransactionTotals(
    expenses: Expense[],
    incomes: Income[],
    matchesRecord: (record: Expense | Income) => boolean,
    _categoryNameById: Map<string, string>,
): ParentSubtransactionTotals {
    const childExpenseByParentId = new Map<string, number>();
    const childIncomeByParentId = new Map<string, number>();
    const holyCowExpenseShareByParentId = new Map<string, number>();

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
        const amount = getIncomeSum(child);
        if (isHolyCowExpenseShareIncomeCategoryId(child.categoryId)) {
            addSubtransactionTotal(holyCowExpenseShareByParentId, parentId, amount);
        } else {
            addSubtransactionTotal(childIncomeByParentId, parentId, amount);
        }
    }

    return { childExpenseByParentId, childIncomeByParentId, holyCowExpenseShareByParentId };
}

/** Сумма «гостевых» подтранзакций (без явной доли HC). */
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

export function holyCowExpenseShareSubtotalForParent(
    parentEntityId: string,
    totals: ParentSubtransactionTotals,
): number {
    const id = normalizeMongoIdString(parentEntityId).trim();
    if (!id) return 0;
    return totals.holyCowExpenseShareByParentId.get(id) ?? 0;
}

/**
 * Доля Holy Cow: явные подтранзакции «Доля расходов HC», иначе (сумма − прочие подтранзакции) × %.
 */
export function holyCowShareFromLineTotal(
    lineTotalAbs: number,
    subtransactionTotal: number,
    percent: number,
    agencySubtransactionTotal = 0,
): number {
    const explicitAgency = Math.max(0, agencySubtransactionTotal);
    if (explicitAgency > 0) return explicitAgency;
    const base = Math.max(0, lineTotalAbs - subtransactionTotal);
    return base * (percent / 100);
}

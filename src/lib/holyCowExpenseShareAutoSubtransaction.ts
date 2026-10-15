import {
    HOLY_COW_EXPENSE_SHARE_INCOME_CATEGORY_ID,
    isHolyCowExpenseShareIncomeCategoryId,
} from '@/lib/accountancyCategoryIds';
import {
    findCategoryById,
    resolveCategoryTransactionDefaults,
    type CategoryDefaultsContext,
} from '@/lib/accountancyCategoryResolve';
import { getReportLineTotal } from '@/lib/accountancyUtils';
import { roundAccountancyAmount } from '@/lib/accountancyOverviewSyntheticFill';
import { isHolyCowExpenseShareIncomeCategory } from '@/lib/holyCowExpenseShareCalculation';
import { normalizeMongoIdString } from '@/lib/mongoId';
import type { AccountancyCategory, Expense, Income } from '@/lib/types';

export const HOLY_COW_EXPENSE_SHARE_AUTO_PERCENT = 30;

function toDate(value: Date | string | undefined): Date {
    if (!value) return new Date();
    const d = typeof value === 'string' ? new Date(value) : value;
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

function childMatchesParent(
    child: Expense | Income,
    parentId: string,
    parentType: 'expense' | 'income',
): boolean {
    if (parentType === 'expense') {
        return normalizeMongoIdString(child.parentExpenseId).trim() === parentId;
    }
    return normalizeMongoIdString(child.parentIncomeId).trim() === parentId;
}

/** Подтранзакции-приходы «Доля расходов HC» для данного родителя. */
export function findHolyCowExpenseShareChildren(
    parentId: string,
    parentType: 'expense' | 'income',
    incomes: Income[],
): Income[] {
    const id = normalizeMongoIdString(parentId).trim();
    if (!id) return [];

    return incomes.filter((income) => {
        if (
            !isHolyCowExpenseShareIncomeCategoryId(income.categoryId) &&
            !isHolyCowExpenseShareIncomeCategory(income.categoryId, income.category ?? '')
        ) {
            return false;
        }
        return childMatchesParent(income, id, parentType);
    });
}

/**
 * Сумма уже существующих подтранзакций родителя, кроме «Доля расходов HC».
 * База для авто-доли HC: (сумма родителя − эта сумма) × 30%.
 */
export function sumNonHolyCowSubtransactionTotals(
    parentId: string,
    parentType: 'expense' | 'income',
    expenses: Expense[],
    incomes: Income[],
): number {
    const id = normalizeMongoIdString(parentId).trim();
    if (!id) return 0;

    let sum = 0;
    for (const expense of expenses) {
        if (!childMatchesParent(expense, id, parentType)) continue;
        sum += Math.abs(getReportLineTotal(expense));
    }
    for (const income of incomes) {
        if (!childMatchesParent(income, id, parentType)) continue;
        if (
            isHolyCowExpenseShareIncomeCategoryId(income.categoryId) ||
            isHolyCowExpenseShareIncomeCategory(income.categoryId, income.category ?? '')
        ) {
            continue;
        }
        sum += Math.abs(getReportLineTotal(income));
    }
    return sum;
}

export function computeHolyCowExpenseShareAmount(
    parent: Expense | Income,
    percent: number = HOLY_COW_EXPENSE_SHARE_AUTO_PERCENT,
    nonHolyCowSubtransactionTotal = 0,
): number {
    const lineTotal = Math.abs(getReportLineTotal(parent));
    const base = Math.max(0, lineTotal - Math.max(0, nonHolyCowSubtransactionTotal));
    return roundAccountancyAmount(base * (percent / 100));
}

export type BuildHolyCowExpenseShareIncomePayloadOptions = {
    expenses?: Expense[];
    incomes?: Income[];
};

/** Payload прихода «Доля расходов HC» с полями по правилам категории. */
export function buildHolyCowExpenseShareIncomePayload(
    parent: Expense | Income,
    parentType: 'expense' | 'income',
    incomeCategories: AccountancyCategory[],
    categoryContext: CategoryDefaultsContext,
    options?: BuildHolyCowExpenseShareIncomePayloadOptions,
): Income | null {
    const parentId = normalizeMongoIdString(parent._id).trim();
    if (!parentId) return null;

    const nonHcTotal = sumNonHolyCowSubtransactionTotals(
        parentId,
        parentType,
        options?.expenses ?? [],
        options?.incomes ?? [],
    );
    const amount = computeHolyCowExpenseShareAmount(
        parent,
        HOLY_COW_EXPENSE_SHARE_AUTO_PERCENT,
        nonHcTotal,
    );
    if (!(amount > 0)) return null;

    const cat =
        findCategoryById(incomeCategories, HOLY_COW_EXPENSE_SHARE_INCOME_CATEGORY_ID) ??
        incomeCategories.find((c) => isHolyCowExpenseShareIncomeCategory(c._id, c.name ?? ''));
    const categoryId = cat?._id
        ? normalizeMongoIdString(cat._id).trim()
        : HOLY_COW_EXPENSE_SHARE_INCOME_CATEGORY_ID;
    const categoryName = (cat?.name ?? 'Доля расходов HC').trim() || 'Доля расходов HC';
    const defaults = resolveCategoryTransactionDefaults(cat, categoryContext);
    const parentLink =
        parentType === 'expense'
            ? { parentExpenseId: parentId }
            : { parentIncomeId: parentId };

    return {
        objectId: parent.objectId,
        roomName: parent.roomName,
        bookingId: parent.bookingId,
        source: defaults.source,
        recipient: defaults.recipient,
        cashflowId: parent.cashflowId ?? null,
        categoryId,
        category: categoryName,
        amount,
        quantity: 1,
        date: toDate(parent.date),
        comment: '',
        status: 'draft',
        reportMonth: parent.reportMonth || undefined,
        attachments: [],
        accountantId: '',
        includeInSynthetic: true,
        ...parentLink,
    };
}

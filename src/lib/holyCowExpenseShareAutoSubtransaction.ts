import {
    HOLY_COW_EXPENSE_SHARE_INCOME_CATEGORY_ID,
    isHolyCowExpenseShareIncomeCategoryId,
} from '@/lib/accountancyCategoryIds';
import {
    findCategoryById,
    resolveCategoryTransactionDefaults,
    type CategoryDefaultsContext,
} from '@/lib/accountancyCategoryResolve';
import { getIncomeSum, getReportLineTotal } from '@/lib/accountancyUtils';
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
    /** Процент комиссии родителя. Без него — 30%. */
    percent?: number;
};

/** Сумма подтранзакции по колонке «Сумма»: количество × стоимость. */
export function holyCowExpenseShareLineTotal(income: Income): number {
    return roundAccountancyAmount(Math.abs(getIncomeSum(income)));
}

/** Сумма, которую видно в отчёте: сумма для отчёта, если задана, иначе количество × стоимость. */
export function holyCowExpenseShareDisplayedTotal(children: Income[]): number {
    return roundAccountancyAmount(
        children.reduce((sum, child) => sum + Math.abs(getReportLineTotal(child)), 0),
    );
}

/**
 * Стоимость кастомная, если сумма подтранзакций не равна формуле при текущем проценте
 * или сумма для отчёта отличается от стоимости транзакции.
 */
export function isHolyCowExpenseShareCostCustom(children: Income[], expectedTotal: number): boolean {
    if (children.length === 0) return false;
    const expected = roundAccountancyAmount(expectedTotal);
    const lines = roundAccountancyAmount(
        children.reduce((sum, child) => sum + holyCowExpenseShareLineTotal(child), 0),
    );
    const displayed = holyCowExpenseShareDisplayedTotal(children);
    return lines !== expected || displayed !== expected;
}

/** Новые суммы строк так, чтобы их итог совпал с формулой. Одна строка получает всю сумму. */
export function allocateHolyCowExpenseShareLineTotals(children: Income[], nextTotal: number): number[] {
    const target = roundAccountancyAmount(Math.max(0, nextTotal));
    if (children.length === 0) return [];
    if (children.length === 1) return [target];

    const currents = children.map(holyCowExpenseShareLineTotal);
    const sum = roundAccountancyAmount(currents.reduce((total, value) => total + value, 0));
    if (sum <= 0) {
        return children.map((_, index) => (index === 0 ? target : 0));
    }

    const allocated = currents.map((current) => roundAccountancyAmount(target * (current / sum)));
    const drift = roundAccountancyAmount(target - allocated.reduce((total, value) => total + value, 0));
    allocated[allocated.length - 1] = roundAccountancyAmount(allocated[allocated.length - 1] + drift);
    return allocated;
}

export type HolyCowExpenseShareAmountPatch = {
    quantity: number;
    amount: number;
    reportAmount: number | null;
};

/** Поля стоимости под новую сумму строки. Количество сохраняется, если произведение сходится до копейки. */
export function holyCowExpenseShareAmountPatch(
    child: Income,
    lineTotal: number,
): HolyCowExpenseShareAmountPatch {
    const safeTotal = roundAccountancyAmount(Math.max(0, lineTotal));
    const quantity = child.quantity && child.quantity > 0 ? child.quantity : 1;
    let amount = roundAccountancyAmount(safeTotal / quantity);
    let nextQuantity = quantity;
    if (roundAccountancyAmount(amount * nextQuantity) !== safeTotal) {
        nextQuantity = 1;
        amount = safeTotal;
    }
    const reportAmount =
        child.reportAmount == null || !Number.isFinite(Number(child.reportAmount))
            ? null
            : safeTotal;
    return { quantity: nextQuantity, amount, reportAmount };
}

export function holyCowExpenseShareAmountUnchanged(
    child: Income,
    patch: HolyCowExpenseShareAmountPatch,
): boolean {
    const quantity = child.quantity && child.quantity > 0 ? child.quantity : 1;
    const report =
        child.reportAmount == null || !Number.isFinite(Number(child.reportAmount))
            ? null
            : roundAccountancyAmount(Number(child.reportAmount));
    return quantity === patch.quantity && roundAccountancyAmount(child.amount ?? 0) === patch.amount && report === patch.reportAmount;
}

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
        options?.percent ?? HOLY_COW_EXPENSE_SHARE_AUTO_PERCENT,
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

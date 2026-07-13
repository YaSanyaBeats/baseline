import type { AccountancyOverviewOperationRowModel } from '@/components/accountancy/AccountancyOverviewOperationTableRow';
import {
    BOOKING_GROUP_MANAGEMENT_COMMISSION_AUTO_CATEGORY,
    HOLY_COW_EXPENSE_SHARE_AUTO_CATEGORY,
} from '@/lib/accountancyOperationGroupCategoryOrder';
import { isHolyCowExpenseShareIncomeCategory } from '@/lib/holyCowExpenseShareCalculation';
import { isManagementCommissionExpenseCategory } from '@/lib/ownerViewExpenses';

/** Округление до копеек (как в отображении сумм в бухгалтерии). */
export function roundAccountancyAmount(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
}

export function isAccountancyBalanceZeroish(balance: number): boolean {
    return roundAccountancyAmount(balance) === 0;
}

export function isAccountancyBalanceNegative(balance: number): boolean {
    return roundAccountancyAmount(balance) < 0;
}

export function isAccountancyBalancePositive(balance: number): boolean {
    return roundAccountancyAmount(balance) > 0;
}

export function accountancyBalanceMuiColor(
    balance: number,
    errorColor: 'error' | 'error.main' = 'error.main',
): 'success.main' | 'error' | 'error.main' {
    return isAccountancyBalanceNegative(balance) ? errorColor : 'success.main';
}

/** Сумма за единицу из синтетической строки сводки. */
export function resolveSyntheticCalculatedUnitAmount(row: AccountancyOverviewOperationRowModel): number {
    const quantity = row.quantity || 1;
    if (row.syntheticCommissionDetail?.commission != null) {
        return Math.abs(row.syntheticCommissionDetail.commission) / quantity;
    }
    return Math.abs(row.amount) / quantity;
}

/**
 * Реальная транзакция, которую заполняет синтетическая строка (комиссия / доля HC).
 * Если подходящей записи в группе нет — null (кнопка «стрелка вверх» disabled).
 */
export function findSyntheticFillTargetRow(
    syntheticRow: AccountancyOverviewOperationRowModel,
    groupRows: readonly AccountancyOverviewOperationRowModel[],
): AccountancyOverviewOperationRowModel | null {
    if (!syntheticRow.readOnlySynthetic) return null;

    const isPersisted = (row: AccountancyOverviewOperationRowModel) =>
        !row.readOnlySynthetic && !row.isPendingDraft && !!row.entityId;

    if (syntheticRow.category === BOOKING_GROUP_MANAGEMENT_COMMISSION_AUTO_CATEGORY) {
        if (syntheticRow.bookingId == null) return null;
        return (
            groupRows.find(
                (row) =>
                    isPersisted(row) &&
                    row.type === 'expense' &&
                    row.bookingId === syntheticRow.bookingId &&
                    isManagementCommissionExpenseCategory(row.category, row.categoryId),
            ) ?? null
        );
    }

    if (syntheticRow.category === HOLY_COW_EXPENSE_SHARE_AUTO_CATEGORY) {
        return (
            groupRows.find(
                (row) =>
                    isPersisted(row) &&
                    row.type === 'income' &&
                    isHolyCowExpenseShareIncomeCategory(row.categoryId, row.category),
            ) ?? null
        );
    }

    return null;
}

export function lastCalendarDayOfReportMonth(monthKey: string): Date {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    return new Date(year, month, 0);
}

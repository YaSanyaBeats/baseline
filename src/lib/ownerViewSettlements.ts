import { resolveCategoryName } from '@/lib/accountancyCategoryResolve';
import {
    getNoBookingSubgroupCategoryOrder,
    sortRowsByAccountancyCategoryOrder,
} from '@/lib/accountancyOperationGroupCategoryOrder';
import { incomeInReportMonth } from '@/lib/commissionCalculation';
import type { ObjectCommissionResult } from '@/lib/commissionForObject';
import { transactionMatchesOwnerRooms } from '@/lib/ownerObjectsFilter';
import { resolveNoBookingSubgroupForTransaction } from '@/lib/noBookingCategorySubgroups';
import type { AccountancyCategory, Expense, Income } from '@/lib/types';

export type CommissionOwnerViewSettlementRow = {
    key: string;
    date: string;
    description: string;
    amount: number;
    balance: number;
};

type PendingSettlementRow = {
    key: string;
    date: string;
    category: string;
    description: string;
    amount: number;
};

function transactionLineTotal(record: { quantity?: number; amount: number }): number {
    return (record.quantity ?? 1) * (record.amount ?? 0);
}

function rowDescription(categoryName: string, comment?: string): string {
    return comment ? `${categoryName} (${comment})` : categoryName;
}

function rowKey(record: Income | Expense, type: 'income' | 'expense', line: number): string {
    return record._id ?? `${type}-${record.objectId}-${String(record.date)}-${line}`;
}

export function buildOwnerViewSettlementRows(
    objectReports: ObjectCommissionResult[],
    monthKey: string,
    categoryNameById: Map<string, string>,
    categories: AccountancyCategory[],
    allIncomes: Income[],
    allExpenses: Expense[]
): CommissionOwnerViewSettlementRow[] {
    const ownerObjectIds = new Set(objectReports.map((r) => r.objectId));
    const roomsByObjectId = new Map(
        objectReports.map((r) => [r.objectId, r.roomsForObject] as const)
    );

    const pending: PendingSettlementRow[] = [];

    const pushIfMutual = (record: Income | Expense, type: 'income' | 'expense') => {
        if (!ownerObjectIds.has(record.objectId)) return;
        if (record.bookingId != null) return;

        const rooms = roomsByObjectId.get(record.objectId);
        if (!rooms || !transactionMatchesOwnerRooms(record.roomName, rooms)) return;
        if (!incomeInReportMonth(record, monthKey)) return;

        const categoryName = resolveCategoryName(record, categoryNameById);
        const subgroup = resolveNoBookingSubgroupForTransaction(
            record.categoryId,
            categoryName,
            categories
        );
        if (subgroup !== 'mutual') return;

        const line = transactionLineTotal(record);
        if (line === 0) return;

        pending.push({
            key: rowKey(record, type, line),
            date: String(record.date),
            category: categoryName,
            description: rowDescription(categoryName, record.comment),
            amount: type === 'income' ? line : -line,
        });
    };

    for (const income of allIncomes) pushIfMutual(income, 'income');
    for (const expense of allExpenses) pushIfMutual(expense, 'expense');

    sortRowsByAccountancyCategoryOrder(pending, getNoBookingSubgroupCategoryOrder('mutual'));

    let balance = 0;
    return pending.map((row) => {
        balance += row.amount;
        return {
            key: row.key,
            date: row.date,
            description: row.description,
            amount: row.amount,
            balance,
        };
    });
}

import { roundAccountancyAmount } from '@/lib/accountancyOverviewSyntheticFill';
import type { CommissionOwnerViewRoomSection } from '@/lib/commissionOwnerView';
import {
    sumOwnerViewExpenseColumnSigned,
    sumOwnerViewExpenseTableSignedTotal,
    type CommissionOwnerViewExpenseGroup,
} from '@/lib/ownerViewExpenses';
import {
    normalizeOwnerViewSettlementRow,
    type CommissionOwnerViewSettlementRow,
} from '@/lib/ownerViewSettlements';

function expenseGroupsForEarnings(
    groups: CommissionOwnerViewExpenseGroup[]
): CommissionOwnerViewExpenseGroup[] {
    return groups
        .map((group) => ({
            ...group,
            lines: group.lines.filter((line) => !line.isIncome),
        }))
        .filter((group) => group.lines.length > 0);
}

/** ИТОГО комнаты в блоке «Результаты месяца по объекту» — та же формула, что на экране отчёта. */
export function computeOwnerViewRoomEarnings(section: CommissionOwnerViewRoomSection): {
    expensesIncludingAgency: number;
    earningsNet: number;
} {
    const expenseGroups = expenseGroupsForEarnings(section.expenseGroups);
    const expenseColumnTotal = sumOwnerViewExpenseTableSignedTotal(expenseGroups);
    const agencyExpenseColumnTotal = sumOwnerViewExpenseColumnSigned(expenseGroups, 'agency');
    const expensesIncludingAgency = expenseColumnTotal + agencyExpenseColumnTotal;
    return {
        expensesIncludingAgency,
        earningsNet: section.totals.totalIncome + expensesIncludingAgency,
    };
}

export const OWNER_REPORT_CHECK_LOCALES = ['ru-RU', 'en-US'] as const;

export type OwnerReportCheckLocale = (typeof OWNER_REPORT_CHECK_LOCALES)[number];

export type OwnerReportCheckRow = {
    ownerId: string;
    ownerName: string;
    monthKey: string;
    locale: OwnerReportCheckLocale;
    roomKey: string;
    roomTitle: string;
    roomTotal: number;
    passed: boolean;
    zeroTotal: boolean;
};

export type RoomSettlementCheck = {
    roomKey: string;
    roomTitle: string;
    roomTotal: number;
    passed: boolean;
    /** Нулевое итого не порождает строку во взаиморасчётах. */
    zeroTotal: boolean;
};

/**
 * Для каждой комнаты ищет неиспользованную транзакцию взаиморасчётов
 * с той же суммой (до копейки), что и ИТОГО комнаты.
 */
export function checkRoomEarningsAgainstSettlements(
    sections: CommissionOwnerViewRoomSection[],
    settlementRows: CommissionOwnerViewSettlementRow[]
): RoomSettlementCheck[] {
    const transactions = settlementRows
        .map((row) => normalizeOwnerViewSettlementRow(row))
        .filter((row) => row.kind === 'transaction');
    const used = new Set<number>();

    return sections.map((section) => {
        const roomTotal = roundAccountancyAmount(computeOwnerViewRoomEarnings(section).earningsNet);
        if (roomTotal === 0) {
            return {
                roomKey: section.key,
                roomTitle: section.title,
                roomTotal,
                passed: true,
                zeroTotal: true,
            };
        }

        const idx = transactions.findIndex(
            (row, index) =>
                !used.has(index) && roundAccountancyAmount(row.signedAmount) === roomTotal
        );
        if (idx >= 0) used.add(idx);

        return {
            roomKey: section.key,
            roomTitle: section.title,
            roomTotal,
            passed: idx >= 0,
            zeroTotal: false,
        };
    });
}

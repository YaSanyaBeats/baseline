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
import { parseSourceRecipientValue } from '@/lib/sourceRecipientParse';

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
    /** Сумма транзакций взаиморасчётов, привязанных к этой комнате. */
    settlementSum: number;
    passed: boolean;
    zeroTotal: boolean;
};

export type RoomSettlementCheck = {
    roomKey: string;
    roomTitle: string;
    roomTotal: number;
    settlementSum: number;
    passed: boolean;
    /** Нулевое итого не порождает строку во взаиморасчётах. */
    zeroTotal: boolean;
};

/** Ключ секции отчёта: `${objectId}::${roomName}`. */
export function parseOwnerViewRoomSectionKey(
    key: string
): { objectId: number; roomName: string } | null {
    const separator = key.indexOf('::');
    if (separator <= 0) return null;
    const objectId = Number(key.slice(0, separator));
    const roomName = key.slice(separator + 2).trim();
    if (!Number.isFinite(objectId) || !roomName) return null;
    return { objectId, roomName };
}

/**
 * Поле, в котором у транзакции взаиморасчётов указан объект комнаты:
 * расход — «От кого», приход — «Кому».
 */
export function settlementPartyValue(row: CommissionOwnerViewSettlementRow): string | undefined {
    if (row.recordType === 'expense') return row.source;
    if (row.recordType === 'income') return row.recipient;
    return undefined;
}

export function settlementRowMatchesRoom(
    row: CommissionOwnerViewSettlementRow,
    objectId: number,
    roomName: string
): boolean {
    const parsed = parseSourceRecipientValue(settlementPartyValue(row));
    if (!parsed || parsed.type !== 'room') return false;
    return parsed.objectId === objectId && parsed.roomName.trim() === roomName.trim();
}

function settlementAmountsForRoom(
    settlementRows: CommissionOwnerViewSettlementRow[],
    objectId: number,
    roomName: string
): number[] {
    const amounts: number[] = [];
    for (const row of settlementRows) {
        if (row.kind !== 'transaction') continue;
        if (!settlementRowMatchesRoom(row, objectId, roomName)) continue;
        amounts.push(roundAccountancyAmount(row.signedAmount));
    }
    return amounts;
}

/** Сумма знаковых сумм транзакций взаиморасчётов, относящихся к комнате. */
export function sumSettlementAmountsForRoom(
    settlementRows: CommissionOwnerViewSettlementRow[],
    objectId: number,
    roomName: string
): number {
    const sum = settlementAmountsForRoom(settlementRows, objectId, roomName).reduce(
        (total, amount) => total + amount,
        0
    );
    return roundAccountancyAmount(sum);
}

function amountCents(value: number): number {
    return Math.round(roundAccountancyAmount(value) * 100);
}

/** Суммы всех поднаборов, включая пустой (0). */
function subsetSums(values: number[]): number[] {
    const sums = [0];
    for (const value of values) {
        const size = sums.length;
        for (let index = 0; index < size; index++) sums.push(sums[index] + value);
    }
    return sums;
}

/** Суммы непустых поднаборов. */
function nonEmptySubsetSums(values: number[]): number[] {
    const sums: number[] = [];
    const reached = [0];
    for (const value of values) {
        const size = reached.length;
        for (let index = 0; index < size; index++) {
            const next = reached[index] + value;
            reached.push(next);
            sums.push(next);
        }
    }
    return sums;
}

/**
 * Есть непустая комбинация сумм, равная итогу:
 * все транзакции вместе, одна транзакция или любой другой набор.
 */
export function settlementCombinationMatchesTotal(amounts: number[], roomTotal: number): boolean {
    const target = amountCents(roomTotal);
    const values = amounts.map(amountCents).filter((value) => value !== 0);
    if (values.length === 0) return target === 0;
    if (values.some((value) => value === target)) return true;
    if (values.reduce((sum, value) => sum + value, 0) === target) return true;

    const half = Math.floor(values.length / 2);
    const leftNonEmpty = nonEmptySubsetSums(values.slice(0, half));
    const rightAny = new Set(subsetSums(values.slice(half)));
    const rightNonEmpty = new Set(nonEmptySubsetSums(values.slice(half)));

    for (const leftSum of leftNonEmpty) {
        if (rightAny.has(target - leftSum)) return true;
    }
    return rightNonEmpty.has(target);
}

/** ВРЕМЕННО: май 2026 и раньше проходят проверку без сверки сумм. */
const OWNER_REPORT_CHECK_WAIVED_THROUGH = '2026-05';

export function isOwnerReportCheckWaived(monthKey: string): boolean {
    return /^\d{4}-\d{2}$/.test(monthKey) && monthKey <= OWNER_REPORT_CHECK_WAIVED_THROUGH;
}

/**
 * Итого комнаты сверяется с транзакциями взаиморасчётов,
 * у которых в «От кого» (расход) или «Кому» (приход) указана эта комната.
 * Проверка пройдена, если итог равен сумме всех таких транзакций,
 * одной из них или любой их комбинации.
 */
export function checkRoomEarningsAgainstSettlements(
    sections: CommissionOwnerViewRoomSection[],
    settlementRows: CommissionOwnerViewSettlementRow[],
    monthKey?: string
): RoomSettlementCheck[] {
    const waived = monthKey != null && isOwnerReportCheckWaived(monthKey);
    const transactions = settlementRows
        .map((row) => normalizeOwnerViewSettlementRow(row))
        .filter((row) => row.kind === 'transaction');

    return sections.map((section) => {
        const roomTotal = roundAccountancyAmount(computeOwnerViewRoomEarnings(section).earningsNet);
        const room = parseOwnerViewRoomSectionKey(section.key);
        const amounts = room ? settlementAmountsForRoom(transactions, room.objectId, room.roomName) : [];
        const fullSum = roundAccountancyAmount(amounts.reduce((total, amount) => total + amount, 0));
        const passed = waived || settlementCombinationMatchesTotal(amounts, roomTotal);

        return {
            roomKey: section.key,
            roomTitle: section.title,
            roomTotal,
            settlementSum: passed ? roomTotal : fullSum,
            passed,
            zeroTotal: roomTotal === 0,
        };
    });
}

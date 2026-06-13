import { sortRowsByAccountancyCategoryOrder } from '@/lib/accountancyOperationGroupCategoryOrder';
import { getExpenseSum, getIncomeSum } from '@/lib/accountancyUtils';
import type { ObjectCommissionResult } from '@/lib/commissionForObject';
import {
    OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_NAME,
    OWNER_VIEW_SETTLEMENT_CATEGORY_ORDER,
    ownerBalanceCategoryKind,
    resolveOwnerBalanceCanonicalCategoryName,
} from '@/lib/ownerBalanceCategories';
import { transactionMatchesOwnerRooms } from '@/lib/ownerObjectsFilter';
import type { AccountancyCategory, Expense, Income } from '@/lib/types';

export type CommissionOwnerViewSettlementRowKind = 'opening' | 'closing' | 'transaction';

export type CommissionOwnerViewSettlementRow = {
    key: string;
    date: string;
    description: string;
    amount: number;
    kind: CommissionOwnerViewSettlementRowKind;
    /** Знак суммы по формуле баланса владельца (для подсветки в UI). */
    signedAmount: number;
    category?: string;
    /** @deprecated накопительный остаток; колонка убрана из отчёта */
    balance?: number;
};

type PendingSettlementRow = {
    key: string;
    date: string;
    category: string;
    description: string;
    amount: number;
};

const SETTLEMENT_LABELS: Record<string, { opening: string; closing: string }> = {
    ru: {
        opening: 'Остаток на начало',
        closing: 'Итого (Остаток на конец)',
    },
    en: {
        opening: 'Opening balance',
        closing: 'Total (Closing balance)',
    },
};

function ledgerMonthFromRecord(
    date: Date | string | undefined,
    reportMonth: string | undefined | null
): string | null {
    const rm = (reportMonth ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(rm)) return rm;
    if (!date) return null;
    const parsed = new Date(date as string | Date);
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function lastDayOfMonth(monthKey: string): string {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const last = new Date(year, month, 0);
    const day = String(last.getDate()).padStart(2, '0');
    return `${monthKey}-${day}`;
}

/** Дата строки взаиморасчёта в отчёте: 15-е для выплаты, 30-е для начисления и списания. */
function settlementTransactionDisplayDate(monthKey: string, category: string): string {
    let day: number;
    switch (ownerBalanceCategoryKind(category)) {
        case 'payout':
            day = 15;
            break;
        case 'accrued':
        case 'debited':
            day = 30;
            break;
        default:
            day = 1;
    }
    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const lastDay = new Date(year, month, 0).getDate();
    const effectiveDay = Math.min(day, lastDay);
    return `${monthKey}-${String(effectiveDay).padStart(2, '0')}`;
}

function formatSettlementPeriod(reportMonth: string | null | undefined, date: Date | string): string {
    const rm = (reportMonth ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(rm)) {
        const [y, m] = rm.split('-');
        return `${m}.${y}`;
    }
    const parsed = new Date(date as string | Date);
    if (Number.isNaN(parsed.getTime())) return '—';
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${m}.${parsed.getFullYear()}`;
}

function settlementDescription(
    categoryName: string,
    objectName: string,
    roomName: string,
    period: string,
    comment?: string
): string {
    const base = `${categoryName} (${objectName}, ${roomName}, ${period})`;
    const trimmed = (comment ?? '').trim();
    return trimmed ? `${base} — ${trimmed}` : base;
}

function rowKey(record: Income | Expense, type: 'income' | 'expense'): string {
    const line =
        type === 'income' ? getIncomeSum(record as Income) : getExpenseSum(record as Expense);
    return record._id ?? `${type}-${record.objectId}-${String(record.date)}-${line}`;
}

function transactionAmount(record: Income | Expense, type: 'income' | 'expense'): number {
    return type === 'income' ? getIncomeSum(record as Income) : getExpenseSum(record as Expense);
}

export function ownerSettlementSignedAmount(category: string, amount: number): number {
    const abs = Math.abs(amount);
    switch (ownerBalanceCategoryKind(category)) {
        case 'payout':
        case 'debited':
            return -abs;
        case 'accrued':
            return abs;
        default:
            return amount;
    }
}

export function ownerBalanceSignedLineAmount(
    category: string,
    record: { quantity?: number; amount: number }
): number {
    const line = (record.quantity ?? 1) * (record.amount ?? 0);
    return ownerSettlementSignedAmount(category, line);
}

function settlementLabels(language: string): { opening: string; closing: string } {
    const lang = language.startsWith('en') ? 'en' : 'ru';
    return SETTLEMENT_LABELS[lang] ?? SETTLEMENT_LABELS.ru;
}

export function buildOwnerViewSettlementRows(
    objectReports: ObjectCommissionResult[],
    monthKey: string,
    categoryNameById: Map<string, string>,
    _categories: AccountancyCategory[],
    allIncomes: Income[],
    allExpenses: Expense[],
    language = 'ru'
): CommissionOwnerViewSettlementRow[] {
    const ownerObjectIds = new Set(objectReports.map((r) => r.objectId));
    const roomsByObjectId = new Map(
        objectReports.map((r) => [r.objectId, r.roomsForObject] as const)
    );
    const objectNameById = new Map(objectReports.map((r) => [r.objectId, r.objectName] as const));
    const labels = settlementLabels(language);

    const matchesOwner = (record: Income | Expense): boolean => {
        if (!ownerObjectIds.has(record.objectId)) return false;
        const rooms = roomsByObjectId.get(record.objectId);
        if (!rooms || !transactionMatchesOwnerRooms(record.roomName, rooms)) return false;
        return true;
    };

    let openingBalance = 0;
    const monthPending: PendingSettlementRow[] = [];

    const processRecord = (record: Income | Expense, type: 'income' | 'expense') => {
        if (!matchesOwner(record)) return;

        const categoryName = resolveOwnerBalanceCanonicalCategoryName(record, categoryNameById);
        if (!categoryName) return;

        const amount = transactionAmount(record, type);
        if (amount === 0) return;

        const ledgerMonth = ledgerMonthFromRecord(record.date, record.reportMonth);
        if (!ledgerMonth) return;

        if (ledgerMonth < monthKey) {
            openingBalance += ownerSettlementSignedAmount(categoryName, amount);
            return;
        }
        if (ledgerMonth !== monthKey) return;

        const objectName = objectNameById.get(record.objectId) ?? String(record.objectId);
        const roomName = (record.roomName ?? '').trim() || '—';
        const period = formatSettlementPeriod(record.reportMonth, record.date);

        monthPending.push({
            key: rowKey(record, type),
            date: settlementTransactionDisplayDate(monthKey, categoryName),
            category: categoryName,
            description: settlementDescription(
                categoryName,
                objectName,
                roomName,
                period,
                record.comment
            ),
            amount,
        });
    };

    for (const income of allIncomes) processRecord(income, 'income');
    for (const expense of allExpenses) processRecord(expense, 'expense');

    if (openingBalance === 0 && monthPending.length === 0) {
        return [];
    }

    sortRowsByAccountancyCategoryOrder(monthPending, OWNER_VIEW_SETTLEMENT_CATEGORY_ORDER);

    const closingBalance =
        openingBalance +
        monthPending.reduce((s, r) => s + ownerSettlementSignedAmount(r.category, r.amount), 0);

    const firstDay = `${monthKey}-01`;
    const lastDay = lastDayOfMonth(monthKey);

    const result: CommissionOwnerViewSettlementRow[] = [
        {
            key: 'settlement-opening',
            date: firstDay,
            description: labels.opening,
            amount: openingBalance,
            kind: 'opening',
            signedAmount: openingBalance,
        },
    ];

    for (const row of monthPending) {
        result.push({
            key: row.key,
            date: row.date,
            description: row.description,
            amount: row.amount,
            kind: 'transaction',
            category: row.category,
            signedAmount: ownerSettlementSignedAmount(row.category, row.amount),
        });
    }

    result.push({
        key: 'settlement-closing',
        date: lastDay,
        description: labels.closing,
        amount: closingBalance,
        kind: 'closing',
        signedAmount: closingBalance,
    });

    return result;
}

const OWNER_BALANCE_CATEGORY_PREFIXES = [
    OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_NAME,
    'Списано со счёта владельца',
    'Начислено владельцу',
    'Выплата владельцу',
] as const;

function inferSettlementCategory(description: string): string | undefined {
    for (const cat of OWNER_BALANCE_CATEGORY_PREFIXES) {
        if (description.startsWith(cat)) {
            return cat === 'Списано со счёта владельца'
                ? OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_NAME
                : cat;
        }
    }
    return undefined;
}

function inferSettlementKind(row: CommissionOwnerViewSettlementRow): CommissionOwnerViewSettlementRowKind {
    if (row.kind === 'opening' || row.kind === 'closing' || row.kind === 'transaction') {
        return row.kind;
    }
    if (row.key === 'settlement-opening') return 'opening';
    if (row.key === 'settlement-closing') return 'closing';
    return 'transaction';
}

/** Нормализация строк из кэша (sessionStorage) без kind / signedAmount. */
export function normalizeOwnerViewSettlementRow(
    row: CommissionOwnerViewSettlementRow,
    monthKey?: string
): CommissionOwnerViewSettlementRow {
    const kind = inferSettlementKind(row);

    if (kind === 'opening' || kind === 'closing') {
        if (row.signedAmount !== undefined && row.kind === kind) {
            return row;
        }
        return {
            ...row,
            kind,
            signedAmount: row.signedAmount ?? row.amount,
        };
    }

    const category = row.category ?? inferSettlementCategory(row.description);
    const signedAmount =
        row.signedAmount ??
        (category != null ? ownerSettlementSignedAmount(category, row.amount) : row.amount);
    const date =
        monthKey && category
            ? settlementTransactionDisplayDate(monthKey, category)
            : row.date;

    if (row.signedAmount !== undefined && row.kind === kind && date === row.date) {
        return { ...row, kind: 'transaction', category, signedAmount };
    }

    return {
        ...row,
        kind: 'transaction',
        category,
        signedAmount,
        date,
    };
}

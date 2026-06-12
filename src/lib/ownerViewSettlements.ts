import { resolveCategoryName } from '@/lib/accountancyCategoryResolve';
import { sortRowsByAccountancyCategoryOrder } from '@/lib/accountancyOperationGroupCategoryOrder';
import { getExpenseSum, getIncomeSum } from '@/lib/accountancyUtils';
import type { ObjectCommissionResult } from '@/lib/commissionForObject';
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

const OWNER_BALANCE_CATEGORIES = new Set([
    'Начислено владельцу',
    'Выплата владельцу',
    'Списано со счёта владельца',
]);

const OWNER_VIEW_SETTLEMENT_CATEGORY_ORDER = [
    'Выплата владельцу',
    'Начислено владельцу',
    'Списано со счёта владельца',
] as const;

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
    switch (category) {
        case 'Выплата владельцу':
        case 'Списано со счёта владельца':
            return -abs;
        case 'Начислено владельцу':
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

        const categoryName = resolveCategoryName(record, categoryNameById);
        if (!OWNER_BALANCE_CATEGORIES.has(categoryName)) return;

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
            date: String(record.date),
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
    'Выплата владельцу',
    'Начислено владельцу',
    'Списано со счёта владельца',
] as const;

function inferSettlementCategory(description: string): string | undefined {
    for (const cat of OWNER_BALANCE_CATEGORY_PREFIXES) {
        if (description.startsWith(cat)) return cat;
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
    row: CommissionOwnerViewSettlementRow
): CommissionOwnerViewSettlementRow {
    const kind = inferSettlementKind(row);
    if (row.signedAmount !== undefined && row.kind === kind) {
        return row;
    }

    if (kind === 'opening' || kind === 'closing') {
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

    return {
        ...row,
        kind: 'transaction',
        category,
        signedAmount,
    };
}

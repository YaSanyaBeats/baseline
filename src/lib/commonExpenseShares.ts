import { getReportLineTotal } from '@/lib/accountancyUtils';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { isExcludedOwnerViewExpenseCategory, isManagementCommissionExpenseCategory } from '@/lib/ownerViewExpenses';

/**
 * Доли строки «Общие расходы» для таблицы транзакций.
 * Только отображение: в отчёты и в базу не попадает.
 *
 * Совпадает с базой отчёта владельца (`buildOwnerViewExpenseGroupsForRoom`,
 * подгруппа common): доля агентства — (сумма строки − подтранзакции) × % комиссии,
 * если делимость включена, строка не дочерняя и не «комиссия за управление».
 * Доля гостя — сумма подтранзакций. Доля владельца — остаток суммы строки.
 */
export type CommonExpenseShareParts = {
    agency: number;
    guest: number;
    owner: number;
};

type ShareSourceRow = {
    type: 'expense' | 'income';
    entityId: string;
    category: string;
    categoryId?: string;
    quantity: number;
    /** Сумма со знаком колонки «Сумма». */
    amount: number;
    reportAmount?: number | null;
    includeInSynthetic?: boolean;
    commissionPercent?: number;
    parentTransaction?: { id: string } | null;
    readOnlySynthetic?: boolean;
    isPendingDraft?: boolean;
};

function commissionPercentForCommonShare(percent: number | undefined): number {
    const p = Number(percent);
    if (p === 15 || p === 20 || p === 25 || p === 30) return p;
    return 30;
}

/** |сумма для отчёта|, иначе |количество × цена| — как {@link getReportLineTotal}. */
export function reportLineTotalFromSignedRow(row: {
    amount: number;
    quantity: number;
    reportAmount?: number | null;
}): number {
    const qty = row.quantity ?? 1;
    const unit = qty === 0 ? 0 : Math.abs(row.amount) / qty;
    return getReportLineTotal({
        amount: unit,
        quantity: qty,
        reportAmount: row.reportAmount,
    });
}

/** Сумма подтранзакций по id родителя. Расходы из исключённых категорий отчёта не входят. */
export function subtransactionTotalByParentId(rows: ShareSourceRow[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of rows) {
        if (row.readOnlySynthetic || row.isPendingDraft || !row.parentTransaction) continue;
        if (
            row.type === 'expense' &&
            isExcludedOwnerViewExpenseCategory(row.category, row.categoryId)
        ) {
            continue;
        }
        const parentId = normalizeMongoIdString(row.parentTransaction.id).trim();
        if (!parentId) continue;
        const line = reportLineTotalFromSignedRow(row);
        if (line === 0) continue;
        map.set(parentId, (map.get(parentId) ?? 0) + line);
    }
    return map;
}

export function splitCommonExpenseShares(input: {
    lineTotal: number;
    subtransactionTotal: number;
    includeInSynthetic?: boolean;
    commissionPercent?: number;
    isChild: boolean;
    isManagementCommission: boolean;
}): CommonExpenseShareParts {
    const lineTotal = Math.abs(input.lineTotal);
    const guest = Math.max(0, input.subtransactionTotal);
    const hasCommissionDeduction =
        !input.isManagementCommission && input.includeInSynthetic !== false && !input.isChild;
    const agency = hasCommissionDeduction
        ? Math.max(0, lineTotal - guest) * (commissionPercentForCommonShare(input.commissionPercent) / 100)
        : 0;
    const owner = lineTotal - agency - guest;
    return { agency, guest, owner };
}

/** Доли со знаком колонки «Сумма»: расход отрицательный, доход положительный. */
export function signedCommonExpenseShares(
    row: ShareSourceRow,
    totalsByParentId: Map<string, number>,
): CommonExpenseShareParts {
    const lineTotal = reportLineTotalFromSignedRow(row);
    const parentId = normalizeMongoIdString(row.entityId).trim();
    const guest = parentId ? (totalsByParentId.get(parentId) ?? 0) : 0;
    const parts = splitCommonExpenseShares({
        lineTotal,
        subtransactionTotal: guest,
        includeInSynthetic: row.includeInSynthetic,
        commissionPercent: row.commissionPercent,
        isChild: Boolean(row.parentTransaction),
        isManagementCommission:
            row.type === 'expense' &&
            isManagementCommissionExpenseCategory(row.category, row.categoryId),
    });
    const sign = row.type === 'expense' ? -1 : 1;
    return {
        agency: sign * parts.agency,
        guest: sign * parts.guest,
        owner: sign * parts.owner,
    };
}

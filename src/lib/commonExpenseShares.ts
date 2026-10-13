import { isHolyCowExpenseShareIncomeCategoryId } from '@/lib/accountancyCategoryIds';
import { getReportLineTotal } from '@/lib/accountancyUtils';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { isExcludedOwnerViewExpenseCategory, isManagementCommissionExpenseCategory } from '@/lib/ownerViewExpenses';

/**
 * Доли строки «Общие расходы» для таблицы транзакций.
 * Только отображение: в отчёты и в базу не попадает.
 *
 * Совпадает с базой отчёта владельца (`buildOwnerViewExpenseGroupsForRoom`,
 * подгруппа common):
 * — подтранзакции категории «Доля расходов HC» (по categoryId) → доля агентства;
 * — остальные подтранзакции → доля гостя;
 * — если явных HC-подтранзакций нет и делимость включена —
 *   доля агентства = (сумма − доля гостя) × % комиссии.
 * Доля владельца — остаток суммы строки.
 */
export type CommonExpenseShareParts = {
    agency: number;
    guest: number;
    owner: number;
};

export type ParentShareSubtransactionTotals = {
    /** Подтранзакции кроме «Доля расходов HC» → колонка «Доля гостя». */
    guestByParentId: Map<string, number>;
    /** Подтранзакции «Доля расходов HC» (по categoryId) → колонка «Доля агентства». */
    agencyByParentId: Map<string, number>;
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

/**
 * Суммы подтранзакций по id родителя.
 * Приходы «Доля расходов HC» (по categoryId) — в agency; остальное — в guest.
 * Расходы из исключённых категорий отчёта не входят.
 */
export function subtransactionTotalByParentId(rows: ShareSourceRow[]): ParentShareSubtransactionTotals {
    const guestByParentId = new Map<string, number>();
    const agencyByParentId = new Map<string, number>();
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
        const isAgencyShare =
            row.type === 'income' && isHolyCowExpenseShareIncomeCategoryId(row.categoryId);
        const map = isAgencyShare ? agencyByParentId : guestByParentId;
        map.set(parentId, (map.get(parentId) ?? 0) + line);
    }
    return { guestByParentId, agencyByParentId };
}

/**
 * Доля агентства: явные подтранзакции HC, иначе (сумма − гость) × % при делимости.
 */
export function resolveAgencyExpenseShare(input: {
    lineTotal: number;
    guestSubtransactionTotal: number;
    agencySubtransactionTotal: number;
    includeInSynthetic?: boolean;
    commissionPercent?: number;
    isChild: boolean;
    isManagementCommission: boolean;
}): number {
    const lineTotal = Math.abs(input.lineTotal);
    const guest = Math.max(0, input.guestSubtransactionTotal);
    const explicitAgency = Math.max(0, input.agencySubtransactionTotal);
    if (explicitAgency > 0) return explicitAgency;
    const hasCommissionDeduction =
        !input.isManagementCommission && input.includeInSynthetic !== false && !input.isChild;
    if (!hasCommissionDeduction) return 0;
    return Math.max(0, lineTotal - guest) * (commissionPercentForCommonShare(input.commissionPercent) / 100);
}

export function splitCommonExpenseShares(input: {
    lineTotal: number;
    /** Подтранзакции не HC — доля гостя. */
    guestSubtransactionTotal?: number;
    /** Подтранзакции «Доля расходов HC» — доля агентства. */
    agencySubtransactionTotal?: number;
    includeInSynthetic?: boolean;
    commissionPercent?: number;
    isChild: boolean;
    isManagementCommission: boolean;
}): CommonExpenseShareParts {
    const lineTotal = Math.abs(input.lineTotal);
    const guest = Math.max(0, input.guestSubtransactionTotal ?? 0);
    const agency = resolveAgencyExpenseShare({
        lineTotal,
        guestSubtransactionTotal: guest,
        agencySubtransactionTotal: input.agencySubtransactionTotal ?? 0,
        includeInSynthetic: input.includeInSynthetic,
        commissionPercent: input.commissionPercent,
        isChild: input.isChild,
        isManagementCommission: input.isManagementCommission,
    });
    const owner = lineTotal - agency - guest;
    return { agency, guest, owner };
}

/** Доли со знаком колонки «Сумма»: расход отрицательный, доход положительный. */
export function signedCommonExpenseShares(
    row: ShareSourceRow,
    totals: ParentShareSubtransactionTotals,
): CommonExpenseShareParts {
    const lineTotal = reportLineTotalFromSignedRow(row);
    const parentId = normalizeMongoIdString(row.entityId).trim();
    const guest = parentId ? (totals.guestByParentId.get(parentId) ?? 0) : 0;
    const agencyExplicit = parentId ? (totals.agencyByParentId.get(parentId) ?? 0) : 0;
    const parts = splitCommonExpenseShares({
        lineTotal,
        guestSubtransactionTotal: guest,
        agencySubtransactionTotal: agencyExplicit,
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

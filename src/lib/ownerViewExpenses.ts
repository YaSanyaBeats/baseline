import { resolveCategoryName } from '@/lib/accountancyCategoryResolve';
import {
    BOOKING_GROUP_MANAGEMENT_COMMISSION_AUTO_CATEGORY,
    HOLY_COW_EXPENSE_SHARE_AUTO_CATEGORY,
} from '@/lib/accountancyOperationGroupCategoryOrder';
import { joinBookingGroupSegments, buildBookingGroupLineModel } from '@/lib/bookingGroupLine';
import {
    getDefaultManagementCommissionPercent,
    getNightsCount,
    incomeInReportMonth,
    isCoAgentCommission,
    isOtaCommission,
    type CommissionSchemeId,
} from '@/lib/commissionCalculation';
import type { ObjectCommissionResult } from '@/lib/commissionForObject';
import { isOwnerAccessibleRoomName, transactionMatchesOwnerRooms } from '@/lib/ownerObjectsFilter';
import { resolveNoBookingSubgroupForTransaction } from '@/lib/noBookingCategorySubgroups';
import type { AccountancyCategory, Booking, Expense, Income } from '@/lib/types';

const DEFAULT_SCHEME_ID: CommissionSchemeId = 2;

export const MANAGEMENT_COMMISSION_EXPENSE_CATEGORY = 'Комиссия за управление';

const EXCLUDED_EXPENSE_CATEGORIES = new Set([
    BOOKING_GROUP_MANAGEMENT_COMMISSION_AUTO_CATEGORY,
    HOLY_COW_EXPENSE_SHARE_AUTO_CATEGORY,
    'Доля расходов Holy Cow Phuket',
]);

function isManagementCommissionExpense(categoryName: string): boolean {
    return categoryName.trim() === MANAGEMENT_COMMISSION_EXPENSE_CATEGORY;
}

export type CommissionOwnerViewExpenseLine = {
    key: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    /** Доля расхода (Holy Cow): для брони × % комиссии, для общих/гостя — полная сумма. */
    expenseShare: number;
    isAgency: boolean;
    isGuestLine: boolean;
    /** «Комиссия за управление»: полная сумма в «Расход», без доли в «Расходы агентства». */
    isManagementCommission: boolean;
    /** «Общие расходы» / «Расходы владельца»: «Расход» = 100% суммы, «Расходы агентства» = «—». */
    isCommonOrOwnerLine: boolean;
    /** Транзакция «Приход»: в колонке «Расход» — плюс, в «Итого» — с положительным знаком. */
    isIncome?: boolean;
    /** Чекбокс «Делимость»: при false доля агентства не вычитается (полная сумма в «Расход»). */
    includeInCommissionShare?: boolean;
    /** Признак, что в колонке «Расход» применялось вычитание комиссии. */
    hasCommissionDeduction?: boolean;
    /** Сумма всех подтранзакций (база для комиссии и колонки «Расход»). */
    totalSubtransactionsTotal?: number | null;
    /** Подтранзакции группы «Расходы гостя» → колонка «Расходы гостя». */
    guestSubtransactionsTotal?: number | null;
    /** Подтранзакции группы «Расходы HC» (и OTA/ко-агент) → колонка «Расходы агентства». */
    agencySubtransactionsTotal?: number | null;
    /** Подтранзакции не выводятся отдельными строками. */
    isSubtransaction?: boolean;
};

export type CommissionOwnerViewExpenseGroup = {
    key: string;
    kind: 'booking' | 'common' | 'guest' | 'owner';
    /** Заголовок группы брони (kind=booking) */
    label: string;
    /** i18n-ключ для «Общие расходы» / «Расходы гостя» / «Расходы владельца» */
    labelI18nKey?: string;
    lines: CommissionOwnerViewExpenseLine[];
};

type BookingMeta = {
    booking: Booking;
    nights: number;
    objectId: number;
    objectName: string;
    roomsForObject: ObjectCommissionResult['roomsForObject'];
};

function transactionLineTotal(record: { quantity?: number; amount?: number }): number {
    return (record.quantity ?? 1) * (record.amount ?? 0);
}

function isExcludedExpenseCategory(categoryName: string): boolean {
    return EXCLUDED_EXPENSE_CATEGORIES.has(categoryName.trim());
}

function getManagementPercentForBooking(
    booking: Booking,
    roomsForObject: { id: number; commissionSchemeId?: 1 | 2 | 3 | 4 }[],
    nights: number
): number {
    const room = roomsForObject.find((r) => r.id === booking.unitId);
    const scheme = room?.commissionSchemeId;
    const schemeId =
        scheme != null && scheme >= 1 && scheme <= 4 ? (scheme as CommissionSchemeId) : DEFAULT_SCHEME_ID;
    return getDefaultManagementCommissionPercent(schemeId, nights);
}

function stableUnitLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

function roomLabelForBooking(
    booking: Booking,
    rooms: { id: number; name?: string }[]
): string {
    const room = rooms.find((r) => r.id === booking.unitId);
    if (room) return stableUnitLabel(room);
    if (booking.unitId != null) return `Unit ${booking.unitId}`;
    return '—';
}

function resolveBookingMeta(
    record: { bookingId?: number | null; objectId: number },
    objectReports: ObjectCommissionResult[],
    bookingMeta: Map<number, BookingMeta>,
    extraBookings: Booking[]
): BookingMeta | null {
    if (record.bookingId == null) return null;
    const existing = bookingMeta.get(record.bookingId);
    if (existing) return existing;
    const objectReport = objectReports.find((r) => r.objectId === record.objectId);
    const booking = extraBookings.find((b) => b.id === record.bookingId);
    if (!objectReport || !booking) return null;
    return {
        booking,
        nights: 0,
        objectId: objectReport.objectId,
        objectName: objectReport.objectName,
        roomsForObject: objectReport.roomsForObject,
    };
}

function bookingGroupLabel(booking: Booking): string {
    return joinBookingGroupSegments(buildBookingGroupLineModel(booking).segments);
}

function transactionDescription(
    record: { comment?: string },
    categoryName: string
): string {
    return record.comment ? `${categoryName} (${record.comment})` : categoryName;
}

function expenseLineKey(e: Expense, line: number): string {
    return e._id ?? `exp-${e.bookingId ?? 'u'}-${String(e.date)}-${e.category}-${line}`;
}

function normalizeMongoId(value: unknown): string {
    if (value == null) return '';
    return String(value).trim();
}

function hasParentTransaction(record: {
    parentExpenseId?: string | null;
    parentIncomeId?: string | null;
}): boolean {
    return normalizeMongoId(record.parentExpenseId) !== '' || normalizeMongoId(record.parentIncomeId) !== '';
}

function commissionPercentForNoBookingTransaction(record: { commissionPercent?: number }): number {
    const p = Number(record.commissionPercent);
    if (p === 15 || p === 20 || p === 25 || p === 30) return p;
    return 30;
}

/** «Расходы владельца»: без чекбокса «Делимость» — комиссия не вычитается. */
function shouldApplyNoBookingCommissionShare(
    subgroup: 'common' | 'guest' | 'owner',
    includeInSynthetic: boolean | undefined
): boolean {
    if (subgroup === 'owner') return false;
    return includeInSynthetic !== false;
}

/** Сумма − все подтранзакции; комиссия считается от этой базы. */
function ownerViewNetLineTotal(row: CommissionOwnerViewExpenseLine): number {
    const total = row.totalSubtransactionsTotal ?? row.guestSubtransactionsTotal ?? 0;
    return row.lineTotal - total;
}

type ChildTransactionSums = {
    total: number;
    guest: number;
    agency: number;
};

function childSubtransactionBucket(
    record: Expense | Income,
    categories: AccountancyCategory[],
    categoryNameById: Map<string, string>
): 'guest' | 'agency' | 'other' {
    const categoryName = resolveCategoryName(record, categoryNameById);
    const subgroup = resolveNoBookingSubgroupForTransaction(
        record.categoryId,
        categoryName,
        categories
    );
    if (subgroup === 'guest') return 'guest';
    if (subgroup === 'hc') return 'agency';
    if (isOtaCommission(categoryName) || isCoAgentCommission(categoryName)) return 'agency';
    return 'other';
}

function sumChildTransactions(
    record: { childExpenseIds?: string[]; childIncomeIds?: string[] },
    expenseById: Map<string, Expense>,
    incomeById: Map<string, Income>,
    categories: AccountancyCategory[],
    categoryNameById: Map<string, string>
): ChildTransactionSums | null {
    const expenseIds = (record.childExpenseIds ?? []).map(normalizeMongoId).filter(Boolean);
    const incomeIds = (record.childIncomeIds ?? []).map(normalizeMongoId).filter(Boolean);
    if (expenseIds.length === 0 && incomeIds.length === 0) return null;

    let total = 0;
    let guest = 0;
    let agency = 0;

    const addChild = (child: Expense | Income) => {
        const amount = transactionLineTotal(child);
        if (amount === 0) return;
        total += amount;
        const bucket = childSubtransactionBucket(child, categories, categoryNameById);
        if (bucket === 'guest') guest += amount;
        else if (bucket === 'agency') agency += amount;
    };

    for (const id of expenseIds) {
        const child = expenseById.get(id);
        if (child) addChild(child);
    }
    for (const id of incomeIds) {
        const child = incomeById.get(id);
        if (child) addChild(child);
    }

    if (total === 0) return null;
    return { total, guest, agency };
}

export function buildOwnerViewExpenseGroupsForRoom(
    objectReport: ObjectCommissionResult,
    roomName: string,
    monthKey: string,
    categoryNameById: Map<string, string>,
    categories: AccountancyCategory[],
    allExpenses: Expense[],
    allIncomes: Income[],
    objectReports: ObjectCommissionResult[],
    bookingMeta: Map<number, BookingMeta>,
    extraBookings: Booking[]
): CommissionOwnerViewExpenseGroup[] {
    if (!isOwnerAccessibleRoomName(roomName, objectReport.roomsForObject)) {
        return [];
    }

    type NoBookingSubgroup = 'common' | 'guest' | 'owner';

    type PendingLine = CommissionOwnerViewExpenseLine & {
        bookingId: number | null;
        sortDate: string;
        noBookingSubgroup?: NoBookingSubgroup;
    };

    const pending: PendingLine[] = [];
    const expenseById = new Map(
        allExpenses
            .filter((e) => normalizeMongoId(e._id) !== '')
            .map((e) => [normalizeMongoId(e._id), e] as const)
    );
    const incomeById = new Map(
        allIncomes
            .filter((i) => normalizeMongoId(i._id) !== '')
            .map((i) => [normalizeMongoId(i._id), i] as const)
    );

    for (const expense of allExpenses) {
        if (expense.objectId !== objectReport.objectId) continue;
        if (!incomeInReportMonth(expense, monthKey)) continue;

        const includeInCommissionShare = expense.includeInSynthetic !== false;

        const categoryName = resolveCategoryName(expense, categoryNameById);
        if (isExcludedExpenseCategory(categoryName)) continue;

        const lineTotal = transactionLineTotal(expense);
        if (lineTotal === 0) continue;
        if (hasParentTransaction(expense)) continue;

        const isAgency = isOtaCommission(categoryName) || isCoAgentCommission(categoryName);
        const childSums = sumChildTransactions(
            expense,
            expenseById,
            incomeById,
            categories,
            categoryNameById
        );
        const netLineTotal = lineTotal - (childSums?.total ?? 0);

        if (expense.bookingId != null) {
            const meta = resolveBookingMeta(expense, objectReports, bookingMeta, extraBookings);
            if (!meta) continue;
            const bookingRoom = roomLabelForBooking(meta.booking, meta.roomsForObject);
            if (bookingRoom !== roomName) continue;

            const hasCommissionDeduction = includeInCommissionShare;
            let expenseShare = 0;
            if (hasCommissionDeduction) {
                const nights =
                    meta.nights > 0
                        ? meta.nights
                        : getNightsCount(meta.booking.arrival, meta.booking.departure);
                const percent = getManagementPercentForBooking(
                    meta.booking,
                    meta.roomsForObject,
                    nights
                );
                expenseShare = netLineTotal * (percent / 100);
            }

            pending.push({
                key: expenseLineKey(expense, lineTotal),
                description: transactionDescription(expense, categoryName),
                quantity: expense.quantity ?? 1,
                unitPrice: expense.amount ?? 0,
                lineTotal,
                expenseShare,
                isAgency,
                isGuestLine: false,
                isManagementCommission: isManagementCommissionExpense(categoryName),
                isCommonOrOwnerLine: false,
                isIncome: false,
                includeInCommissionShare,
                hasCommissionDeduction,
                totalSubtransactionsTotal: childSums?.total ?? null,
                guestSubtransactionsTotal: childSums?.guest ?? null,
                agencySubtransactionsTotal: childSums?.agency ?? null,
                bookingId: expense.bookingId,
                sortDate: String(expense.date),
            });
            continue;
        }

        if (!transactionMatchesOwnerRooms(expense.roomName, objectReport.roomsForObject)) continue;

        const subgroup = resolveNoBookingSubgroupForTransaction(
            expense.categoryId,
            categoryName,
            categories
        );
        if (subgroup !== 'common' && subgroup !== 'guest' && subgroup !== 'owner') continue;

        const hasCommissionDeduction = shouldApplyNoBookingCommissionShare(
            subgroup,
            expense.includeInSynthetic
        );

        pending.push({
            key: expenseLineKey(expense, lineTotal),
            description: transactionDescription(expense, categoryName),
            quantity: expense.quantity ?? 1,
            unitPrice: expense.amount ?? 0,
            lineTotal,
            expenseShare: hasCommissionDeduction
                ? netLineTotal * (commissionPercentForNoBookingTransaction(expense) / 100)
                : 0,
            isAgency,
            isGuestLine: subgroup === 'guest',
            isManagementCommission: isManagementCommissionExpense(categoryName),
            isCommonOrOwnerLine: subgroup === 'common' || subgroup === 'owner',
            isIncome: false,
            includeInCommissionShare,
            hasCommissionDeduction,
            totalSubtransactionsTotal: childSums?.total ?? null,
            guestSubtransactionsTotal: childSums?.guest ?? null,
            agencySubtransactionsTotal: childSums?.agency ?? null,
            bookingId: null,
            sortDate: String(expense.date),
            noBookingSubgroup: subgroup,
        });
    }

    const bookingMap = new Map<number, PendingLine[]>();
    const noBookingLines: Record<NoBookingSubgroup, PendingLine[]> = {
        common: [],
        guest: [],
        owner: [],
    };

    for (const line of pending) {
        if (line.bookingId != null) {
            if (!bookingMap.has(line.bookingId)) bookingMap.set(line.bookingId, []);
            bookingMap.get(line.bookingId)!.push(line);
        } else if (line.noBookingSubgroup) {
            noBookingLines[line.noBookingSubgroup].push(line);
        }
    }

    const groups: CommissionOwnerViewExpenseGroup[] = [];

    const stripPendingMeta = ({
        sortDate: _s,
        bookingId: _b,
        noBookingSubgroup: _n,
        ...rest
    }: PendingLine): CommissionOwnerViewExpenseLine => rest;

    const bookingIds = [...bookingMap.keys()].sort((a, b) => {
        const ta = bookingMeta.get(a)?.booking?.arrival;
        const tb = bookingMeta.get(b)?.booking?.arrival;
        const timeA = ta ? new Date(ta).getTime() : 0;
        const timeB = tb ? new Date(tb).getTime() : 0;
        return timeB - timeA;
    });

    for (const bid of bookingIds) {
        const lines = bookingMap.get(bid)!;
        const meta = bookingMeta.get(bid);
        const label = meta ? bookingGroupLabel(meta.booking) : `#${bid}`;
        lines.sort((a, c) => new Date(c.sortDate).getTime() - new Date(a.sortDate).getTime());
        groups.push({
            key: `b-${bid}`,
            kind: 'booking',
            label,
            lines: lines.map(stripPendingMeta),
        });
    }

    const sortByDateDesc = (a: PendingLine, b: PendingLine) =>
        new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime();

    const noBookingGroupOrder: NoBookingSubgroup[] = ['common', 'guest', 'owner'];

    for (const sid of noBookingGroupOrder) {
        const lines = noBookingLines[sid];
        if (lines.length === 0) continue;
        lines.sort(sortByDateDesc);
        groups.push({
            key: sid,
            kind: sid,
            label: '',
            labelI18nKey: `accountancy.noBookingSubgroup.${sid}`,
            lines: lines.map(stripPendingMeta),
        });
    }

    return groups;
}

export function ownerViewExpenseColumnValue(
    row: CommissionOwnerViewExpenseLine,
    column: 'expense' | 'agency' | 'guest'
): number | null {
    const signed = (value: number) => (row.isIncome ? Math.abs(value) : -Math.abs(value));
    if (column === 'expense') {
        const totalChild = row.totalSubtransactionsTotal ?? 0;
        if (totalChild > 0) {
            return signed(row.lineTotal - totalChild);
        }
        const guest = row.guestSubtransactionsTotal ?? 0;
        const agencySub = row.agencySubtransactionsTotal ?? 0;
        if (guest + agencySub > 0) {
            return signed(row.lineTotal - guest - agencySub);
        }
        return signed(row.lineTotal - row.expenseShare);
    }
    if (column === 'agency') {
        const agencySub = row.agencySubtransactionsTotal ?? 0;
        const share =
            row.hasCommissionDeduction === true && row.expenseShare > 0 ? row.expenseShare : 0;
        const combined = agencySub + share;
        if (combined === 0) return null;
        return signed(combined);
    }
    if (row.guestSubtransactionsTotal == null || row.guestSubtransactionsTotal === 0) return null;
    return signed(row.guestSubtransactionsTotal);
}

export function sumOwnerViewExpenseColumnAbs(
    groups: CommissionOwnerViewExpenseGroup[],
    column: 'expense' | 'agency' | 'guest'
): number {
    return groups.reduce(
        (sum, g) =>
            sum +
            g.lines.reduce((s, line) => {
                const value = ownerViewExpenseColumnValue(line, column);
                return value == null ? s : s + Math.abs(value);
            }, 0),
        0
    );
}

export function sumOwnerViewExpenseColumnSigned(
    groups: CommissionOwnerViewExpenseGroup[],
    column: 'expense' | 'agency' | 'guest'
): number {
    return groups.reduce(
        (sum, g) =>
            sum +
            g.lines.reduce((s, line) => {
                const value = ownerViewExpenseColumnValue(line, column);
                return value == null ? s : s + value;
            }, 0),
        0
    );
}

/** Итого по колонке «Расход»: приходы +, расходы − (по полной сумме строки). */
export function sumOwnerViewExpenseTableSignedTotal(
    groups: CommissionOwnerViewExpenseGroup[]
): number {
    return sumOwnerViewExpenseColumnSigned(groups, 'expense');
}

export function sumOwnerViewExpenseShares(groups: CommissionOwnerViewExpenseGroup[]): number {
    return groups.reduce(
        (sum, g) => sum + g.lines.reduce((s, line) => s + line.expenseShare, 0),
        0
    );
}

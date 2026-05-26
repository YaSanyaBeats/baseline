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
import type { AccountancyCategory, Booking, Expense } from '@/lib/types';

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

function expenseLineTotal(e: Expense): number {
    return (e.quantity ?? 1) * (e.amount ?? 0);
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
    expense: Expense,
    objectReports: ObjectCommissionResult[],
    bookingMeta: Map<number, BookingMeta>,
    extraBookings: Booking[]
): BookingMeta | null {
    if (expense.bookingId == null) return null;
    const existing = bookingMeta.get(expense.bookingId);
    if (existing) return existing;
    const objectReport = objectReports.find((r) => r.objectId === expense.objectId);
    const booking = extraBookings.find((b) => b.id === expense.bookingId);
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

function expenseDescription(e: Expense, categoryName: string): string {
    return e.comment ? `${categoryName} (${e.comment})` : categoryName;
}

function expenseLineKey(e: Expense, line: number): string {
    return e._id ?? `exp-${e.bookingId ?? 'u'}-${String(e.date)}-${e.category}-${line}`;
}

export function buildOwnerViewExpenseGroupsForRoom(
    objectReport: ObjectCommissionResult,
    roomName: string,
    monthKey: string,
    categoryNameById: Map<string, string>,
    categories: AccountancyCategory[],
    allExpenses: Expense[],
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

    for (const expense of allExpenses) {
        if (expense.objectId !== objectReport.objectId) continue;
        if (expense.includeInSynthetic === false) continue;
        if (!incomeInReportMonth(expense, monthKey)) continue;

        const categoryName = resolveCategoryName(expense, categoryNameById);
        if (isExcludedExpenseCategory(categoryName)) continue;

        const lineTotal = expenseLineTotal(expense);
        if (lineTotal === 0) continue;

        const isAgency = isOtaCommission(categoryName) || isCoAgentCommission(categoryName);

        if (expense.bookingId != null) {
            const meta = resolveBookingMeta(expense, objectReports, bookingMeta, extraBookings);
            if (!meta) continue;
            const bookingRoom = roomLabelForBooking(meta.booking, meta.roomsForObject);
            if (bookingRoom !== roomName) continue;

            const isManagementCommission = isManagementCommissionExpense(categoryName);
            let expenseShare: number;
            if (isManagementCommission) {
                expenseShare = lineTotal;
            } else {
                const nights =
                    meta.nights > 0
                        ? meta.nights
                        : getNightsCount(meta.booking.arrival, meta.booking.departure);
                const percent = getManagementPercentForBooking(
                    meta.booking,
                    meta.roomsForObject,
                    nights
                );
                expenseShare = lineTotal * (percent / 100);
            }

            pending.push({
                key: expenseLineKey(expense, lineTotal),
                description: expenseDescription(expense, categoryName),
                quantity: expense.quantity ?? 1,
                unitPrice: expense.amount ?? 0,
                lineTotal,
                expenseShare,
                isAgency,
                isGuestLine: false,
                isManagementCommission,
                isCommonOrOwnerLine: false,
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

        pending.push({
            key: expenseLineKey(expense, lineTotal),
            description: expenseDescription(expense, categoryName),
            quantity: expense.quantity ?? 1,
            unitPrice: expense.amount ?? 0,
            lineTotal,
            expenseShare: lineTotal,
            isAgency,
            isGuestLine: subgroup === 'guest',
            isManagementCommission: isManagementCommissionExpense(categoryName),
            isCommonOrOwnerLine: subgroup === 'common' || subgroup === 'owner',
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
    if (column === 'expense') {
        if (row.isGuestLine) return null;
        if (row.isCommonOrOwnerLine) return row.lineTotal;
        if (row.isManagementCommission) return -row.expenseShare;
        return row.lineTotal - row.expenseShare;
    }
    if (column === 'agency') {
        if (row.isManagementCommission || row.isCommonOrOwnerLine) return null;
        return -row.expenseShare;
    }
    if (row.isGuestLine) return row.expenseShare;
    return null;
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

export function sumOwnerViewExpenseShares(groups: CommissionOwnerViewExpenseGroup[]): number {
    return groups.reduce(
        (sum, g) => sum + g.lines.reduce((s, line) => s + line.expenseShare, 0),
        0
    );
}

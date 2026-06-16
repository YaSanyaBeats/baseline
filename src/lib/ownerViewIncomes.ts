import { resolveCategoryName } from '@/lib/accountancyCategoryResolve';
import { joinBookingGroupSegments, buildBookingGroupLineModel } from '@/lib/bookingGroupLine';
import { incomeInReportMonth } from '@/lib/commissionCalculation';
import type { ObjectCommissionResult } from '@/lib/commissionForObject';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { isOwnerAccessibleRoomName, transactionMatchesOwnerRooms } from '@/lib/ownerObjectsFilter';
import { resolveNoBookingSubgroupForTransaction } from '@/lib/noBookingCategorySubgroups';
import type { AccountancyCategory, Booking, Income, NoBookingSubgroupId } from '@/lib/types';

/** Категории приходов, отображаемые в таблице, но не входящие в «Итого». */
export const OWNER_VIEW_INCOME_TOTAL_EXCLUDED_CATEGORY_IDS = new Set([
    '6989ec3782886b7142faa382',
]);

export type CommissionOwnerViewIncomeLine = {
    key: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    /** Не учитывать строку в итоге таблицы «Приходы». */
    excludeFromIncomeTotal?: boolean;
};

export type CommissionOwnerViewIncomeGroup = {
    key: string;
    kind: 'booking' | NoBookingSubgroupId;
    /** Заголовок группы брони (kind=booking) */
    label: string;
    /** i18n-ключ для групп «Без брони» */
    labelI18nKey?: string;
    lines: CommissionOwnerViewIncomeLine[];
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

function incomeLineKey(i: Income, line: number): string {
    return i._id ?? `inc-${i.bookingId ?? 'u'}-${String(i.date)}-${i.category}-${line}`;
}

function transactionDescription(record: { comment?: string }, categoryName: string): string {
    return record.comment ? `${categoryName} (${record.comment})` : categoryName;
}

function stableUnitLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

function roomLabelForBooking(booking: Booking, rooms: { id: number; name?: string }[]): string {
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

function isExcludedFromOwnerViewIncomeTotal(income: Income): boolean {
    return false;
    const categoryId = normalizeMongoIdString(income.categoryId);
    //return categoryId !== '' && OWNER_VIEW_INCOME_TOTAL_EXCLUDED_CATEGORY_IDS.has(categoryId);
    
}

export function buildOwnerViewIncomeGroupsForRoom(
    objectReport: ObjectCommissionResult,
    roomName: string,
    monthKey: string,
    categoryNameById: Map<string, string>,
    categories: AccountancyCategory[],
    allIncomes: Income[],
    objectReports: ObjectCommissionResult[],
    bookingMeta: Map<number, BookingMeta>,
    extraBookings: Booking[]
): CommissionOwnerViewIncomeGroup[] {
    if (!isOwnerAccessibleRoomName(roomName, objectReport.roomsForObject)) {
        return [];
    }

    type PendingLine = CommissionOwnerViewIncomeLine & {
        bookingId: number | null;
        sortDate: string;
        noBookingSubgroup?: NoBookingSubgroupId;
    };

    const pending: PendingLine[] = [];

    for (const income of allIncomes) {
        if (income.objectId !== objectReport.objectId) continue;
        if (!incomeInReportMonth(income, monthKey)) continue;

        const categoryName = resolveCategoryName(income, categoryNameById);
        const lineTotal = transactionLineTotal(income);
        if (lineTotal === 0) continue;

        if (income.bookingId != null) {
            const meta = resolveBookingMeta(income, objectReports, bookingMeta, extraBookings);
            if (!meta) continue;
            const bookingRoom = roomLabelForBooking(meta.booking, meta.roomsForObject);
            if (bookingRoom !== roomName) continue;

            pending.push({
                key: incomeLineKey(income, lineTotal),
                description: transactionDescription(income, categoryName),
                quantity: income.quantity ?? 1,
                unitPrice: income.amount ?? 0,
                lineTotal,
                excludeFromIncomeTotal: isExcludedFromOwnerViewIncomeTotal(income),
                bookingId: income.bookingId,
                sortDate: String(income.date),
            });
            continue;
        }

        if (!transactionMatchesOwnerRooms(income.roomName, objectReport.roomsForObject, roomName)) {
            continue;
        }

        const subgroup = resolveNoBookingSubgroupForTransaction(
            income.categoryId,
            categoryName,
            categories
        );
        if (subgroup === 'mutual') continue;

        pending.push({
            key: incomeLineKey(income, lineTotal),
            description: transactionDescription(income, categoryName),
            quantity: income.quantity ?? 1,
            unitPrice: income.amount ?? 0,
            lineTotal,
            excludeFromIncomeTotal: isExcludedFromOwnerViewIncomeTotal(income),
            bookingId: null,
            sortDate: String(income.date),
            noBookingSubgroup: subgroup,
        });
    }

    const bookingMap = new Map<number, PendingLine[]>();
    const noBookingLines: Partial<Record<NoBookingSubgroupId, PendingLine[]>> = {};

    for (const line of pending) {
        if (line.bookingId != null) {
            if (!bookingMap.has(line.bookingId)) bookingMap.set(line.bookingId, []);
            bookingMap.get(line.bookingId)!.push(line);
        } else if (line.noBookingSubgroup) {
            const sid = line.noBookingSubgroup;
            if (!noBookingLines[sid]) noBookingLines[sid] = [];
            noBookingLines[sid]!.push(line);
        }
    }

    const groups: CommissionOwnerViewIncomeGroup[] = [];

    const stripPendingMeta = ({
        sortDate: _s,
        bookingId: _b,
        noBookingSubgroup: _n,
        ...rest
    }: PendingLine): CommissionOwnerViewIncomeLine => rest;

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

    const noBookingGroupOrder: NoBookingSubgroupId[] = ['common', 'guest', 'owner', 'hc', 'other'];

    for (const sid of noBookingGroupOrder) {
        const lines = noBookingLines[sid];
        if (!lines || lines.length === 0) continue;
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

export function sumOwnerViewIncomeTableTotal(groups: CommissionOwnerViewIncomeGroup[]): number {
    return groups.reduce(
        (sum, g) =>
            sum +
            g.lines.reduce(
                (s, line) => (line.excludeFromIncomeTotal ? s : s + line.lineTotal),
                0
            ),
        0
    );
}

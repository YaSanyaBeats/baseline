import { resolveCategoryName } from '@/lib/accountancyCategoryResolve';
import { isHolyCowExpenseShareIncomeCategory } from '@/lib/holyCowExpenseShareCalculation';
import { joinBookingGroupSegments, buildBookingGroupLineModel } from '@/lib/bookingGroupLine';
import { incomeInReportMonth } from '@/lib/commissionCalculation';
import { getReportLineTotal, getReportUnitPrice } from '@/lib/accountancyUtils';
import type { ObjectCommissionResult } from '@/lib/commissionForObject';
import { isOwnerAccessibleRoomName, ownerViewBookingMetaKey, ownerViewRoomNameForLinkedBooking, transactionMatchesOwnerRooms } from '@/lib/ownerObjectsFilter';
import { resolveNoBookingSubgroupForTransaction } from '@/lib/noBookingCategorySubgroups';
import type { AccountancyCategory, Booking, Income, NoBookingSubgroupId } from '@/lib/types';

export type CommissionOwnerViewIncomeLine = {
    key: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
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

function incomeLineKey(i: Income, line: number): string {
    return i._id ?? `inc-${i.bookingId ?? 'u'}-${String(i.date)}-${i.category}-${line}`;
}

function transactionDescription(record: { comment?: string }, categoryName: string): string {
    return record.comment ? `${categoryName} (${record.comment})` : categoryName;
}

function resolveBookingMeta(
    record: { bookingId?: number | null; objectId: number },
    objectReports: ObjectCommissionResult[],
    bookingMeta: Map<string, BookingMeta>,
    extraBookings: Booking[]
): BookingMeta | null {
    if (record.bookingId == null) return null;
    const existing = bookingMeta.get(ownerViewBookingMetaKey(record.objectId, record.bookingId));
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

export function buildOwnerViewIncomeGroupsForRoom(
    objectReport: ObjectCommissionResult,
    roomName: string,
    monthKey: string,
    categoryNameById: Map<string, string>,
    categories: AccountancyCategory[],
    allIncomes: Income[],
    objectReports: ObjectCommissionResult[],
    bookingMeta: Map<string, BookingMeta>,
    extraBookings: Booking[],
    categoryDisplayNameById: Map<string, string> = categoryNameById
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
        const displayCategoryName = resolveCategoryName(income, categoryDisplayNameById);
        const lineTotal = getReportLineTotal(income);
        if (lineTotal === 0 && !isHolyCowExpenseShareIncomeCategory(income.categoryId, categoryName)) {
            continue;
        }

        if (income.bookingId != null) {
            const meta = resolveBookingMeta(income, objectReports, bookingMeta, extraBookings);
            if (meta) {
                const bookingRoom = ownerViewRoomNameForLinkedBooking(
                    meta.booking.unitId,
                    meta.roomsForObject,
                    income.roomName,
                );
                if (bookingRoom !== roomName) continue;
            } else if (
                !transactionMatchesOwnerRooms(income.roomName, objectReport.roomsForObject, roomName)
            ) {
                continue;
            }

            pending.push({
                key: incomeLineKey(income, lineTotal),
                description: transactionDescription(income, displayCategoryName),
                quantity: income.quantity ?? 1,
                unitPrice: getReportUnitPrice(income),
                lineTotal,
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
            description: transactionDescription(income, displayCategoryName),
            quantity: income.quantity ?? 1,
            unitPrice: getReportUnitPrice(income),
            lineTotal,
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

    const bookingForLabel = (bookingId: number) =>
        bookingMeta.get(ownerViewBookingMetaKey(objectReport.objectId, bookingId))?.booking ??
        extraBookings.find((booking) => booking.id === bookingId);

    const bookingIds = [...bookingMap.keys()].sort((a, b) => {
        const ta = bookingForLabel(a)?.arrival;
        const tb = bookingForLabel(b)?.arrival;
        const timeA = ta ? new Date(ta).getTime() : 0;
        const timeB = tb ? new Date(tb).getTime() : 0;
        return timeB - timeA;
    });

    for (const bid of bookingIds) {
        const lines = bookingMap.get(bid)!;
        const booking = bookingForLabel(bid);
        const label = booking ? bookingGroupLabel(booking) : `#${bid}`;
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
        (sum, g) => sum + g.lines.reduce((s, line) => s + line.lineTotal, 0),
        0
    );
}

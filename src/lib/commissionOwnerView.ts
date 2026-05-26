import { resolveCategoryName } from '@/lib/accountancyCategoryResolve';
import { BOOKING_GROUP_MANAGEMENT_COMMISSION_AUTO_CATEGORY } from '@/lib/accountancyOperationGroupCategoryOrder';
import { getNightsCount, incomeInReportMonth, MANAGEMENT_COMMISSION_BASE_INCOME_CATEGORY } from '@/lib/commissionCalculation';
import type { ObjectCommissionResult } from '@/lib/commissionForObject';
import { isOwnerAccessibleRoomName } from '@/lib/ownerObjectsFilter';
import {
    buildOwnerViewExpenseGroupsForRoom,
    sumOwnerViewExpenseShares,
    type CommissionOwnerViewExpenseGroup,
} from '@/lib/ownerViewExpenses';
import {
    buildOwnerViewSettlementRows,
    type CommissionOwnerViewSettlementRow,
} from '@/lib/ownerViewSettlements';
import type { AccountancyCategory, Booking, Expense, Income } from '@/lib/types';

export const COMMISSION_OWNER_VIEW_KEY = 'accountancy-commission-owner-view-v1';

export type { CommissionOwnerViewExpenseGroup, CommissionOwnerViewExpenseLine } from '@/lib/ownerViewExpenses';
export type { CommissionOwnerViewSettlementRow } from '@/lib/ownerViewSettlements';

/** Строка таблицы «Приходы»: одна транзакция «Аренда (баланс/остаток)» + данные брони. */
export type CommissionOwnerViewIncomeRow = {
    key: string;
    bookingId: number;
    arrival: string;
    departure: string;
    guestName: string;
    guestCountLabel: string;
    referrer: string;
    nights: number;
    income: number;
};

/** @deprecated — агрегированные строки v1/v2 */
export type CommissionOwnerViewBookingRow = CommissionOwnerViewIncomeRow;

export type CommissionOwnerViewRoomSection = {
    key: string;
    title: string;
    incomeRows: CommissionOwnerViewIncomeRow[];
    expenseGroups: CommissionOwnerViewExpenseGroup[];
    totals: {
        totalIncome: number;
        totalExpenses: number;
        totalCommission: number;
    };
};

export type CommissionOwnerViewStoredPayload = {
    v: 2;
    reportTitle: string;
    monthKey: string;
    language: string;
    roomSections: CommissionOwnerViewRoomSection[];
    settlementRows: CommissionOwnerViewSettlementRow[];
    totals: {
        totalIncome: number;
        totalExpenses: number;
        totalCommission: number;
    };
};

/** @deprecated v1 */
type CommissionOwnerViewStoredPayloadV1 = {
    v: 1;
    reportTitle: string;
    monthKey: string;
    language: string;
    bookings: CommissionOwnerViewBookingRow[];
    expenseLines?: Array<{
        key: string;
        description: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
        agencyFlag?: boolean;
    }>;
    unlinkedIncomeLines: Array<{ key: string; date: string; description: string; lineTotal: number }>;
    totals: {
        totalIncome: number;
        totalExpenses: number;
        totalCommission: number;
    };
};

export interface CommissionPageResultForOwner {
    reportTitle: string;
    monthKey: string;
    objectReports: ObjectCommissionResult[];
    totalIncome: number;
    totalExpenses: number;
    totalCommission: number;
}

type BookingMeta = {
    booking: Booking;
    nights: number;
    objectId: number;
    objectName: string;
    roomsForObject: ObjectCommissionResult['roomsForObject'];
};

function guestCountLabel(b: Booking): string {
    const a = b.numAdult;
    const c = b.numChild;
    if (a == null && c == null) return '—';
    return String((a ?? 0) + (c ?? 0));
}

function guestDisplayName(b: Booking): string {
    const name = [b.firstName, b.lastName].filter(Boolean).join(' ').trim();
    if (name) return name;
    if (b.title && String(b.title).trim()) return String(b.title).trim();
    return `#${b.id}`;
}

function incomeRowKey(i: Income, line: number): string {
    return i._id ?? `inc-${i.bookingId ?? 'b'}-${String(i.date)}-${line}`;
}

function incomeLineTotal(i: Income): number {
    return (i.quantity ?? 1) * (i.amount ?? 0);
}

function isRentBalanceIncome(i: Income, categoryNameById: Map<string, string>): boolean {
    return (
        resolveCategoryName(i, categoryNameById).trim() === MANAGEMENT_COMMISSION_BASE_INCOME_CATEGORY
    );
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

function sectionTitle(objectName: string, roomName: string, multiObject: boolean): string {
    if (multiObject && roomName !== '—') return `${objectName} — ${roomName}`;
    if (multiObject && roomName === '—') return objectName;
    return roomName;
}

function computeSectionTotals(
    section: Omit<CommissionOwnerViewRoomSection, 'totals'>,
    commissionTotal: number
): CommissionOwnerViewRoomSection['totals'] {
    const totalIncome = section.incomeRows.reduce((s, r) => s + r.income, 0);
    const totalExpenses = sumOwnerViewExpenseShares(section.expenseGroups);
    return { totalIncome, totalExpenses, totalCommission: commissionTotal };
}

type RoomBucket = Omit<CommissionOwnerViewRoomSection, 'totals'> & {
    commissionTotal: number;
    objectId: number;
    roomName: string;
};

function buildBookingMetaMap(objectReports: ObjectCommissionResult[]): Map<number, BookingMeta> {
    const map = new Map<number, BookingMeta>();
    for (const objectReport of objectReports) {
        for (const { booking, calculation } of objectReport.bookingsReport) {
            map.set(booking.id, {
                booking,
                nights: calculation.nights,
                objectId: objectReport.objectId,
                objectName: objectReport.objectName,
                roomsForObject: objectReport.roomsForObject,
            });
        }
    }
    return map;
}

function resolveBookingMeta(
    income: Income,
    objectReports: ObjectCommissionResult[],
    bookingMeta: Map<number, BookingMeta>,
    extraBookings: Booking[]
): BookingMeta | null {
    if (income.bookingId == null) return null;

    const existing = bookingMeta.get(income.bookingId);
    if (existing) return existing;

    const objectReport = objectReports.find((r) => r.objectId === income.objectId);
    const booking = extraBookings.find((b) => b.id === income.bookingId);
    if (!objectReport || !booking) return null;

    return {
        booking,
        nights: getNightsCount(booking.arrival, booking.departure),
        objectId: objectReport.objectId,
        objectName: objectReport.objectName,
        roomsForObject: objectReport.roomsForObject,
    };
}

function buildRoomSectionsFromObjectReports(
    objectReports: ObjectCommissionResult[],
    monthKey: string,
    categoryNameById: Map<string, string>,
    categories: AccountancyCategory[],
    allIncomes: Income[],
    allExpenses: Expense[],
    extraBookings: Booking[] = []
): CommissionOwnerViewRoomSection[] {
    const multiObject = objectReports.length > 1;
    const buckets = new Map<string, RoomBucket>();
    const bookingMeta = buildBookingMetaMap(objectReports);
    const ownerObjectIds = new Set(objectReports.map((r) => r.objectId));

    const getBucket = (objectId: number, objectName: string, roomName: string) => {
        const key = `${objectId}::${roomName}`;
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = {
                key,
                title: sectionTitle(objectName, roomName, multiObject),
                incomeRows: [],
                expenseGroups: [],
                commissionTotal: 0,
                objectId,
                roomName,
            };
            buckets.set(key, bucket);
        }
        return bucket;
    };

    for (const objectReport of objectReports) {
        const isAccessibleRoom = (roomName: string) =>
            isOwnerAccessibleRoomName(roomName, objectReport.roomsForObject);

        for (const { booking, calculation } of objectReport.bookingsReport) {
            const roomName = roomLabelForBooking(booking, objectReport.roomsForObject);
            if (!isAccessibleRoom(roomName)) continue;
            const bucket = getBucket(objectReport.objectId, objectReport.objectName, roomName);
            bucket.commissionTotal += calculation.commission;
        }
    }

    for (const income of allIncomes) {
        if (income.bookingId == null) continue;
        if (!ownerObjectIds.has(income.objectId)) continue;
        if (!isRentBalanceIncome(income, categoryNameById)) continue;
        if (!incomeInReportMonth(income, monthKey)) continue;

        const line = incomeLineTotal(income);
        if (line === 0) continue;

        const meta = resolveBookingMeta(income, objectReports, bookingMeta, extraBookings);
        if (!meta) continue;

        const roomName = roomLabelForBooking(meta.booking, meta.roomsForObject);
        if (!isOwnerAccessibleRoomName(roomName, meta.roomsForObject)) continue;

        const bucket = getBucket(meta.objectId, meta.objectName, roomName);
        const { booking } = meta;

        bucket.incomeRows.push({
            key: incomeRowKey(income, line),
            bookingId: booking.id,
            arrival: booking.arrival,
            departure: booking.departure,
            guestName: guestDisplayName(booking),
            guestCountLabel: guestCountLabel(booking),
            referrer: booking.refererEditable || booking.referer || booking.channel || '—',
            nights: meta.nights,
            income: line,
        });
    }

    for (const bucket of buckets.values()) {
        const objectReport = objectReports.find((r) => r.objectId === bucket.objectId);
        if (!objectReport) continue;
        bucket.expenseGroups = buildOwnerViewExpenseGroupsForRoom(
            objectReport,
            bucket.roomName,
            monthKey,
            categoryNameById,
            categories,
            allExpenses,
            objectReports,
            bookingMeta,
            extraBookings
        );
    }

    return [...buckets.values()]
        .filter(
            (section) => section.incomeRows.length > 0 || section.expenseGroups.length > 0
        )
        .map(({ commissionTotal, objectId: _oid, roomName: _rn, ...section }) => ({
            ...section,
            incomeRows: section.incomeRows.sort(
                (a, b) => new Date(a.arrival).getTime() - new Date(b.arrival).getTime()
            ),
            totals: computeSectionTotals(section, commissionTotal),
        }))
        .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
}

function normalizeRoomSection(raw: Record<string, unknown>): CommissionOwnerViewRoomSection {
    const incomeRows =
        (Array.isArray(raw.incomeRows) ? raw.incomeRows : null) ??
        (Array.isArray(raw.bookings) ? raw.bookings : []);
    const expenseGroups = Array.isArray(raw.expenseGroups)
        ? (raw.expenseGroups as CommissionOwnerViewExpenseGroup[])
        : [];
    const legacyExpenseLines = Array.isArray(raw.expenseLines) ? raw.expenseLines : [];
    const mergedGroups =
        expenseGroups.length > 0
            ? expenseGroups
            : legacyExpenseLines.length > 0
              ? [
                    {
                        key: 'legacy',
                        kind: 'common' as const,
                        label: '',
                        labelI18nKey: 'accountancy.noBookingSubgroup.common',
                        lines: legacyExpenseLines.map((row: Record<string, unknown>) => ({
                            key: String(row.key ?? ''),
                            description: String(row.description ?? ''),
                            quantity: Number(row.quantity ?? 1),
                            unitPrice: Number(row.unitPrice ?? 0),
                            lineTotal: Number(row.lineTotal ?? 0),
                            expenseShare: Number(row.lineTotal ?? 0),
                            isAgency: Boolean(row.agencyFlag),
                            isGuestLine: false,
                            isManagementCommission: false,
                            isCommonOrOwnerLine: false,
                        })),
                    },
                ]
              : [];
    const sectionBase = {
        key: String(raw.key ?? ''),
        title: String(raw.title ?? ''),
        incomeRows: incomeRows as CommissionOwnerViewIncomeRow[],
        expenseGroups: mergedGroups,
    };
    const existingTotals =
        raw.totals && typeof raw.totals === 'object'
            ? (raw.totals as CommissionOwnerViewRoomSection['totals'])
            : null;
    const commissionTotal = existingTotals?.totalCommission ?? 0;

    return {
        ...sectionBase,
        totals: existingTotals ?? computeSectionTotals(sectionBase, commissionTotal),
    };
}

function migrateV1ToV2(parsed: CommissionOwnerViewStoredPayloadV1): CommissionOwnerViewStoredPayload {
    const section = normalizeRoomSection({
        key: 'legacy',
        title: '—',
        bookings: parsed.bookings,
        expenseLines: parsed.expenseLines,
        totals: parsed.totals,
    });
    return {
        v: 2,
        reportTitle: parsed.reportTitle,
        monthKey: parsed.monthKey,
        language: parsed.language,
        roomSections: [section],
        settlementRows: [],
        totals: parsed.totals,
    };
}

function collectOwnerViewIncomeBookingIds(
    objectReports: ObjectCommissionResult[],
    monthKey: string,
    categoryNameById: Map<string, string>,
    allIncomes: Income[]
): number[] {
    const existing = new Set(
        objectReports.flatMap((o) => o.bookingsReport.map((b) => b.booking.id))
    );
    const ownerObjectIds = new Set(objectReports.map((r) => r.objectId));
    const needed = new Set<number>();

    for (const income of allIncomes) {
        if (income.bookingId == null) continue;
        if (!ownerObjectIds.has(income.objectId)) continue;
        if (!isRentBalanceIncome(income, categoryNameById)) continue;
        if (!incomeInReportMonth(income, monthKey)) continue;
        if (incomeLineTotal(income) === 0) continue;
        if (!existing.has(income.bookingId)) needed.add(income.bookingId);
    }

    return [...needed];
}

export function collectOwnerViewExtraBookingIds(
    objectReports: ObjectCommissionResult[],
    monthKey: string,
    categoryNameById: Map<string, string>,
    categories: AccountancyCategory[],
    allIncomes: Income[],
    allExpenses: Expense[]
): number[] {
    const fromIncomes = collectOwnerViewIncomeBookingIds(
        objectReports,
        monthKey,
        categoryNameById,
        allIncomes
    );
    const existing = new Set(
        objectReports.flatMap((o) => o.bookingsReport.map((b) => b.booking.id))
    );
    const ownerObjectIds = new Set(objectReports.map((r) => r.objectId));
    const needed = new Set<number>(fromIncomes);

    for (const expense of allExpenses) {
        if (expense.bookingId == null) continue;
        if (!ownerObjectIds.has(expense.objectId)) continue;
        if (expense.includeInSynthetic === false) continue;
        if (!incomeInReportMonth(expense, monthKey)) continue;
        const categoryName = resolveCategoryName(expense, categoryNameById);
        if (
            categoryName === BOOKING_GROUP_MANAGEMENT_COMMISSION_AUTO_CATEGORY ||
            categoryName === 'Доля расходов Holy Cow Phuket' ||
            categoryName === 'Доля Расходов Holy Cow Phuket'
        ) {
            continue;
        }
        const line = (expense.quantity ?? 1) * (expense.amount ?? 0);
        if (line === 0) continue;
        if (!existing.has(expense.bookingId)) needed.add(expense.bookingId);
    }

    return [...needed];
}

export function buildCommissionOwnerViewPayload(
    result: CommissionPageResultForOwner,
    language: string,
    categoryNameById: Map<string, string>,
    categories: AccountancyCategory[],
    allIncomes: Income[],
    allExpenses: Expense[],
    extraBookings: Booking[] = []
): CommissionOwnerViewStoredPayload {
    const roomSections = buildRoomSectionsFromObjectReports(
        result.objectReports,
        result.monthKey,
        categoryNameById,
        categories,
        allIncomes,
        allExpenses,
        extraBookings
    );
    const settlementRows = buildOwnerViewSettlementRows(
        result.objectReports,
        result.monthKey,
        categoryNameById,
        categories,
        allIncomes,
        allExpenses
    );
    const totals = roomSections.reduce(
        (acc, section) => ({
            totalIncome: acc.totalIncome + section.totals.totalIncome,
            totalExpenses: acc.totalExpenses + section.totals.totalExpenses,
            totalCommission: acc.totalCommission + section.totals.totalCommission,
        }),
        { totalIncome: 0, totalExpenses: 0, totalCommission: 0 }
    );

    return {
        v: 2,
        reportTitle: result.reportTitle,
        monthKey: result.monthKey,
        language,
        roomSections,
        settlementRows,
        totals,
    };
}

export function parseCommissionOwnerViewPayload(raw: string | null): CommissionOwnerViewStoredPayload | null {
    if (raw == null || raw === '') return null;
    try {
        const parsed = JSON.parse(raw) as CommissionOwnerViewStoredPayload | CommissionOwnerViewStoredPayloadV1;
        if (parsed?.v === 2 && Array.isArray(parsed.roomSections)) {
            return {
                ...parsed,
                settlementRows: Array.isArray(parsed.settlementRows)
                    ? (parsed.settlementRows as CommissionOwnerViewSettlementRow[])
                    : [],
                roomSections: parsed.roomSections.map((s) =>
                    normalizeRoomSection(s as unknown as Record<string, unknown>)
                ),
            };
        }
        if (parsed?.v === 1 && Array.isArray((parsed as CommissionOwnerViewStoredPayloadV1).bookings)) {
            return migrateV1ToV2(parsed as CommissionOwnerViewStoredPayloadV1);
        }
        return null;
    } catch {
        return null;
    }
}

import type { Booking, Expense, Income, Object as Obj, Room } from '@/lib/types';
import { getExpenseSum, getIncomeSum } from '@/lib/accountancyUtils';

/** Категории — как в Mongo (accountancyCategories) и в ТЗ. */
export const ACC_STAT_CAT_RENT_BALANCE = 'Аренда (баланс/остаток)';
export const ACC_STAT_CAT_GUEST_UTIL = 'Коммунальные, платит гость (электричество + вода)';
export const ACC_STAT_CATS_OBJECT_UTIL = [
    'Коммунальные (интернет)',
    'Коммунальные (вода)',
    'Коммунальные (электричество)',
] as const;

export type AccountancyObjectRoomRowHighlight = 'red' | 'yellow' | 'blue' | 'default';

function normalizeUnitOrRoomId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function roomUnitName(room: Room): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

function recordObjectMatchesRowObject(
    recordObjectId: number,
    objectRow: { id: number; propertyId: number },
    allObjects: { id: number; propertyId: number }[],
): boolean {
    const rid = normalizeUnitOrRoomId(recordObjectId);
    if (rid != null && rid === objectRow.id) return true;
    const row = allObjects.find(
        (o) => o.id === recordObjectId || normalizeUnitOrRoomId(o.id) === rid,
    );
    return row != null && row.propertyId === objectRow.propertyId;
}

/**
 * См. `resolveRecordRoomName` в accountancy page: комната для проводки (с учётом брони) — имя юнита.
 */
function createRecordRoomNameResolver(
    objectRow: { id: number; propertyId: number },
    allObjects: { id: number; propertyId: number }[],
    rooms: Room[],
    bookings: Booking[],
) {
    const nameSet = new Set(rooms.map((r) => roomUnitName(r)));

    const bookingBelongsToObject = (booking: Booking) => {
        const bp = booking.propertyId;
        if (bp === undefined || bp === null) return true;
        return bp === objectRow.propertyId || bp === objectRow.id;
    };

    return (recordObjectId: number, recordRoomName?: string | null, bookingId?: number): string | null => {
        if (!recordObjectMatchesRowObject(recordObjectId, objectRow, allObjects)) return null;

        const ridExplicit = (recordRoomName ?? '').trim();
        if (ridExplicit && nameSet.has(ridExplicit)) {
            return ridExplicit;
        }

        const bid = normalizeUnitOrRoomId(bookingId);
        if (bid != null) {
            const booking = bookings.find((b) => normalizeUnitOrRoomId(b.id) === bid);
            if (booking && bookingBelongsToObject(booking)) {
                const uid = normalizeUnitOrRoomId(booking.unitId);
                if (uid != null) {
                    const matchRoom = rooms.find((r) => r.id === uid);
                    if (matchRoom) {
                        const un = roomUnitName(matchRoom);
                        if (nameSet.has(un)) return un;
                    }
                }
            }
        }

        if (ridExplicit) return ridExplicit;
        return null;
    };
}

function bookingBelongsToObjectForRow(
    booking: Booking,
    objectRow: { id: number; propertyId: number },
): boolean {
    const bp = booking.propertyId;
    if (bp === undefined || bp === null) return true;
    return bp === objectRow.propertyId || bp === objectRow.id;
}

function isZeroish(n: number): boolean {
    return !Number.isFinite(n) || Math.abs(n) < 1e-9;
}

function sumCategoryForBooking(
    exps: Expense[],
    incs: Income[],
    bookingId: number,
    category: string,
): number {
    let s = 0;
    for (const e of exps) {
        if (normalizeUnitOrRoomId(e.bookingId) === bookingId && (e.category ?? '') === category) {
            s += getExpenseSum(e);
        }
    }
    for (const i of incs) {
        if (normalizeUnitOrRoomId(i.bookingId) === bookingId && (i.category ?? '') === category) {
            s += getIncomeSum(i);
        }
    }
    return s;
}

function sumCategoryForRoom(
    exps: Expense[],
    incs: Income[],
    resolveRoom: (e: Expense) => string | null,
    resolveRoomI: (i: Income) => string | null,
    roomName: string,
    category: string,
): number {
    let s = 0;
    for (const e of exps) {
        if (resolveRoom(e) === roomName && (e.category ?? '') === category) s += getExpenseSum(e);
    }
    for (const i of incs) {
        if (resolveRoomI(i) === roomName && (i.category ?? '') === category) s += getIncomeSum(i);
    }
    return s;
}

/**
 * Подсветка строки «комната» в дереве objects (слева на /dashboard/accountancy).
 * Данные расходов/доходов — в отборе сводки (в т.ч. report month); брони — по объекту строки.
 */
export function resolveAccountancyObjectRoomRowHighlight(params: {
    objectRow: Obj;
    roomName: string;
    allObjects: Obj[];
    /** «Месяц отчёта» YYYY-MM; без него — default */
    selectedMonth: string;
    bookings: Booking[];
    monthBookingsInPeriod: Booking[];
    /** Уже сузили по report period (по дате / месяцу отчёта) */
    expenses: Expense[];
    incomes: Income[];
}): AccountancyObjectRoomRowHighlight {
    const { objectRow, roomName, allObjects, selectedMonth, bookings, monthBookingsInPeriod, expenses, incomes } =
        params;

    if (!selectedMonth.trim()) return 'default';

    const rooms = objectRow.roomTypes ?? [];
    const resolveRid = createRecordRoomNameResolver(
        { id: objectRow.id, propertyId: objectRow.propertyId },
        allObjects,
        rooms,
        bookings,
    );
    const er = (e: Expense) => resolveRid(e.objectId, e.roomName, e.bookingId);
    const ir = (i: Income) => resolveRid(i.objectId, i.roomName, i.bookingId);

    const exForObj = expenses.filter((e) => recordObjectMatchesRowObject(e.objectId, objectRow, allObjects));
    const incForObj = incomes.filter((i) => recordObjectMatchesRowObject(i.objectId, objectRow, allObjects));

    const roomRow = rooms.find((r) => roomUnitName(r) === roomName);
    const roomUnitId = roomRow?.id;

    const roomBookings = monthBookingsInPeriod.filter((b) => {
        if (!bookingBelongsToObjectForRow(b, objectRow)) return false;
        if (roomUnitId == null) return false;
        return normalizeUnitOrRoomId(b.unitId) === roomUnitId;
    });

    // Red / yellow: по бронированиям, попавшим в месяц
    for (const b of roomBookings) {
        const bid = normalizeUnitOrRoomId(b.id);
        if (bid == null) continue;
        const sumRent = sumCategoryForBooking(exForObj, incForObj, bid, ACC_STAT_CAT_RENT_BALANCE);
        if (isZeroish(sumRent)) return 'red';
    }
    for (const b of roomBookings) {
        const bid = normalizeUnitOrRoomId(b.id);
        if (bid == null) continue;
        const sumGuest = sumCategoryForBooking(exForObj, incForObj, bid, ACC_STAT_CAT_GUEST_UTIL);
        if (isZeroish(sumGuest)) return 'yellow';
    }

    // Blue: коммунальные объекта/комнаты (без привязки к брони)
    for (const cat of ACC_STAT_CATS_OBJECT_UTIL) {
        const sumU = sumCategoryForRoom(exForObj, incForObj, er, ir, roomName, cat);
        if (isZeroish(sumU)) return 'blue';
    }

    return 'default';
}

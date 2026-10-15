import { overlapNights } from './periods';
import { buildMasterIdNightMap, isLongTermBooking, type LtBookingLite } from './lt';
import type { OccupancySlice } from './types';

/** @deprecated Аналитика/desk считают занятыми все статусы кроме black; набор оставлен для legacy-фильтров. */
export const OCCUPIED_STATUSES = new Set(['confirmed', 'new']);
export const OWNER_BLOCK_STATUS = 'black';

export type OccupancyBooking = LtBookingLite & {
    roomId?: number;
    roomID?: number;
    unitId?: number | null;
    status?: string;
};

export function bookingRoomId(b: OccupancyBooking): number | null {
    const id = b.roomId ?? b.roomID;
    if (id == null) return null;
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
}

export function emptyOccupancy(): OccupancySlice {
    return {
        inventoryNights: 0,
        ownerBlockNights: 0,
        ltNights: 0,
        stOccupiedNights: 0,
        availableNights: 0,
        otbPct: 0,
        lt: false,
    };
}

/**
 * Занятость как в analytics:
 * — occupied = все брони кроме black (включая LT и прочие статусы);
 * — available = inventory − black (black сверху режется ёмкостью);
 * — otbPct = occupied / available × 100 (clamp 0…100).
 * LT отдельно только для флага «период закрыт долгосрочной арендой».
 */
export function computeRoomOccupancy(params: {
    units: number;
    periodStartIso: string;
    periodEndIso: string;
    periodNights: number;
    bookings: OccupancyBooking[];
    chainNights?: Map<number, number>;
}): OccupancySlice {
    const { units, periodStartIso, periodEndIso, periodNights, bookings } = params;
    const chain = params.chainNights ?? buildMasterIdNightMap(bookings);
    const inventory = Math.max(0, units) * Math.max(0, periodNights);
    let owner = 0;
    let lt = 0;
    let occupied = 0;

    for (const b of bookings) {
        if (!b.arrival || !b.departure) continue;
        const nights = overlapNights(b.arrival, b.departure, periodStartIso, periodEndIso);
        if (nights <= 0) continue;
        const status = String(b.status || '').toLowerCase();
        if (status === OWNER_BLOCK_STATUS) {
            owner += nights;
            continue;
        }
        occupied += nights;
        if (isLongTermBooking(b, chain)) {
            lt += nights;
        }
    }

    const ownerCapped = inventory > 0 ? Math.min(owner, inventory) : 0;
    const available = Math.max(0, inventory - ownerCapped);
    const occupiedCapped = available > 0 ? Math.min(occupied, available) : 0;
    const otbPct = available > 0 ? (occupiedCapped / available) * 100 : 0;
    const shortTerm = Math.max(0, occupied - lt);
    const ltClosed = inventory > 0 && lt > 0 && shortTerm === 0 && lt >= available;

    return {
        inventoryNights: inventory,
        ownerBlockNights: ownerCapped,
        ltNights: lt,
        stOccupiedNights: occupiedCapped,
        availableNights: available,
        otbPct,
        lt: ltClosed,
    };
}

export function mergeOccupancy(slices: OccupancySlice[]): OccupancySlice {
    const acc = emptyOccupancy();
    for (const s of slices) {
        acc.inventoryNights += s.inventoryNights;
        acc.ownerBlockNights += s.ownerBlockNights;
        acc.ltNights += s.ltNights;
        acc.stOccupiedNights += s.stOccupiedNights;
        acc.availableNights += s.availableNights;
    }
    // Ночной вес (Σ occupied / Σ available) — для кластеров/комнат.
    acc.otbPct = acc.availableNights > 0 ? (acc.stOccupiedNights / acc.availableNights) * 100 : 0;
    acc.lt = slices.some((s) => s.lt);
    return acc;
}

/**
 * Среднее % по юнитам (вес = units roomType) — приближение к analytics.
 * Для точного совпадения с header analytics используй computeCompanyBusyLikeAnalytics.
 */
export function averageOtbPctByUnits(slices: OccupancySlice[], periodNights: number): number {
    const nights = Math.max(0, periodNights);
    if (!slices.length || nights <= 0) return 0;
    let sum = 0;
    let weight = 0;
    for (const s of slices) {
        const units = Math.max(1, Math.round(s.inventoryNights / nights) || 1);
        sum += s.otbPct * units;
        weight += units;
    }
    return weight > 0 ? sum / weight : 0;
}

function parseBookingDate(value: string | Date | undefined): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Busyness одного юнита — тот же clip/формула, что getAnalyticsForPeriod (unitsCount = 1). */
export function unitBusynessLikeAnalytics(
    bookings: OccupancyBooking[],
    periodStart: Date,
    periodEnd: Date,
): number {
    const periodMs = Math.max(0, periodEnd.getTime() - periodStart.getTime());
    if (periodMs <= 0) return 0;
    let blackMs = 0;
    let occupiedMs = 0;
    for (const b of bookings) {
        const arr = parseBookingDate(b.arrival);
        const dep = parseBookingDate(b.departure);
        if (!arr || !dep) continue;
        const a = Math.max(arr.getTime(), periodStart.getTime());
        const d = Math.min(dep.getTime(), periodEnd.getTime());
        if (d <= a) continue;
        if (String(b.status || '').toLowerCase() === OWNER_BLOCK_STATUS) blackMs += d - a;
        else occupiedMs += d - a;
    }
    const capacity = periodMs;
    const total = Math.max(0, capacity - Math.min(blackMs, capacity));
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, occupiedMs / total));
}

/**
 * Занятость компании 1:1 с analytics header (`middleBusyness`):
 * objects + internalObjects → юниты → disable до первой брони → среднее busyness.
 */
export function computeCompanyBusyLikeAnalytics(
    periodStartIso: string,
    periodEndIso: string,
    bookings: OccupancyBooking[],
    objectDocs: Array<{
        id?: number;
        propertyId?: number;
        roomTypes?: Array<{
            id?: number;
            qty?: number;
            units?: Array<{ id?: number; name?: string }>;
        }>;
    }>,
): number {
    const periodStart = new Date(`${periodStartIso.slice(0, 10)}T00:00:00`);
    const periodEnd = new Date(`${periodEndIso.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) return 0;

    const byRoom = new Map<number, OccupancyBooking[]>();
    for (const b of bookings) {
        const id = bookingRoomId(b);
        if (id == null) continue;
        const list = byRoom.get(id) || [];
        list.push(b);
        byRoom.set(id, list);
    }

    let sum = 0;
    let count = 0;

    for (const prop of objectDocs) {
        const propertyIdNum = Number(prop.propertyId ?? prop.id);
        for (const rt of prop.roomTypes || []) {
            const roomTypeId = Number(rt.id);
            if (!Number.isFinite(roomTypeId)) continue;
            const unitIds =
                Array.isArray(rt.units) && rt.units.length
                    ? rt.units.map((u) => Number(u.id)).filter((id) => Number.isFinite(id))
                    : Array.from({ length: Math.max(1, Number(rt.qty) || 1) }, (_, i) => i + 1);
            if (!unitIds.length) continue;

            const isRoomTypeUiRow = roomTypeId !== propertyIdNum;
            const roomBookings = byRoom.get(roomTypeId) || [];

            const firstNights: Record<number, Date> = {};
            for (const b of roomBookings) {
                const arrival = parseBookingDate(b.arrival);
                if (!arrival) continue;
                const uid = b.unitId;
                if (uid != null && !Number.isNaN(Number(uid))) {
                    const k = Number(uid);
                    if (!firstNights[k] || arrival < firstNights[k]) firstNights[k] = arrival;
                    continue;
                }
                if (isRoomTypeUiRow && bookingRoomId(b) === roomTypeId) {
                    for (const id of unitIds) {
                        if (!firstNights[id] || arrival < firstNights[id]) firstNights[id] = arrival;
                    }
                }
            }

            for (const unitId of unitIds) {
                if (firstNights[unitId] && periodEnd < firstNights[unitId]) continue;

                const unitBookings = roomBookings.filter((b) => {
                    const arr = parseBookingDate(b.arrival);
                    const dep = parseBookingDate(b.departure);
                    if (!arr || !dep) return false;
                    const inPeriod = arr <= periodEnd && dep > periodStart;
                    if (!inPeriod) return false;
                    if (b.unitId != null && !Number.isNaN(Number(b.unitId))) {
                        return Number(b.unitId) === unitId;
                    }
                    return (
                        isRoomTypeUiRow &&
                        bookingRoomId(b) === roomTypeId
                    );
                });

                sum += unitBusynessLikeAnalytics(unitBookings, periodStart, periodEnd);
                count += 1;
            }
        }
    }

    return count > 0 ? (sum / count) * 100 : 0;
}

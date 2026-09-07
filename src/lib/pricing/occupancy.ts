import { overlapNights } from './periods';
import { buildMasterIdNightMap, isLongTermBooking, type LtBookingLite } from './lt';
import type { OccupancySlice } from './types';

export const OCCUPIED_STATUSES = new Set(['confirmed', 'new']);
export const OWNER_BLOCK_STATUS = 'black';

export type OccupancyBooking = LtBookingLite & {
    roomId?: number;
    roomID?: number;
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
    let st = 0;

    for (const b of bookings) {
        if (!b.arrival || !b.departure) continue;
        const nights = overlapNights(b.arrival, b.departure, periodStartIso, periodEndIso);
        if (nights <= 0) continue;
        const status = String(b.status || '').toLowerCase();
        if (status === OWNER_BLOCK_STATUS) {
            owner += nights;
            continue;
        }
        if (!OCCUPIED_STATUSES.has(status)) continue;
        if (isLongTermBooking(b, chain)) {
            lt += nights;
        } else {
            st += nights;
        }
    }

    const available = Math.max(0, inventory - owner - lt);
    const otbPct = available > 0 ? (st / available) * 100 : 0;
    return {
        inventoryNights: inventory,
        ownerBlockNights: owner,
        ltNights: lt,
        stOccupiedNights: st,
        availableNights: available,
        otbPct,
        lt: inventory > 0 && available === 0 && lt > 0,
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
    acc.otbPct = acc.availableNights > 0 ? (acc.stOccupiedNights / acc.availableNights) * 100 : 0;
    acc.lt = acc.inventoryNights > 0 && acc.availableNights === 0 && acc.ltNights > 0;
    return acc;
}

import {
    buildClosedPeriodsCache,
    getClosedPeriodsData,
    isLedgerPeriodClosed,
    type ClosedPeriodsCache,
    type ClosedPeriodsData,
} from '@/lib/accountancyClosedMonth';
import {
    resolveUnitNameForAccountingObject,
    type RawBedsObjectForRoom,
} from '@/lib/roomBinding';
import { shouldExpandToRoomTypesPerRawObject } from '@/lib/server/getObjects';
import type { Db } from 'mongodb';

export type BookingSyncDoc = {
    id?: number;
    arrival?: string;
    departure?: string;
    propertyId?: number;
    unitId?: number;
    roomId?: number;
    roomID?: number;
};

export type BookingRoomContext = {
    objectId: number;
    roomKey: string;
};

export function getBookingUnitId(booking: BookingSyncDoc): number | null {
    const uid = booking.unitId ?? booking.roomId ?? booking.roomID;
    if (uid == null) return null;
    const n = Number(uid);
    return Number.isFinite(n) ? n : null;
}

/** Месяцы YYYY-MM, с которыми пересекается бронь (по arrival/departure). */
export function getBookingOverlapMonths(arrival: string | undefined, departure: string | undefined): string[] {
    if (!arrival || !departure) return [];
    const arr = new Date(arrival);
    const dep = new Date(departure);
    if (Number.isNaN(arr.getTime()) || Number.isNaN(dep.getTime())) return [];

    const months: string[] = [];
    const cur = new Date(arr.getFullYear(), arr.getMonth(), 1);
    const last = new Date(dep.getFullYear(), dep.getMonth(), 1);
    while (cur <= last) {
        months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
        cur.setMonth(cur.getMonth() + 1);
    }
    return months;
}

/** Самый поздний зафиксированный отчётный месяц по каждому objectId (комнате объекта). */
export function buildLatestClosedMonthByObjectId(data: ClosedPeriodsData): Map<number, string> {
    const map = new Map<number, string>();
    for (const period of data.roomPeriods) {
        const prev = map.get(period.objectId);
        if (!prev || period.reportMonth > prev) {
            map.set(period.objectId, period.reportMonth);
        }
    }
    return map;
}

export function resolveBookingRoomContexts(
    rawObjects: readonly RawBedsObjectForRoom[],
    propertyId: number | undefined,
    unitId: number | null | undefined,
): BookingRoomContext[] {
    if (propertyId == null || !Number.isFinite(propertyId) || unitId == null) return [];

    const contexts: BookingRoomContext[] = [];
    const seen = new Set<string>();

    for (const doc of rawObjects) {
        if (doc?.id !== propertyId) continue;
        const expanded = shouldExpandToRoomTypesPerRawObject(doc);

        for (const rt of doc.roomTypes || []) {
            for (const unit of rt?.units || []) {
                if (unit?.id !== unitId) continue;
                const roomKey =
                    unit?.name != null && String(unit.name).trim() !== ''
                        ? String(unit.name).trim()
                        : `Unit ${unitId}`;
                const objectId = expanded && typeof rt?.id === 'number' ? rt.id : propertyId;
                const key = `${objectId}:${roomKey}`;
                if (seen.has(key)) continue;
                seen.add(key);
                contexts.push({ objectId, roomKey });
            }
        }
    }

    if (contexts.length === 0) {
        const roomKey = resolveUnitNameForAccountingObject(rawObjects, propertyId, unitId);
        if (roomKey) {
            contexts.push({ objectId: propertyId, roomKey });
        }
    }

    return contexts;
}

export function isBookingProtectedFromSync(
    booking: BookingSyncDoc,
    closedCache: ClosedPeriodsCache,
    latestClosedByObjectId: Map<number, string>,
    rawObjects: readonly RawBedsObjectForRoom[],
): boolean {
    const months = getBookingOverlapMonths(booking.arrival, booking.departure);
    if (months.length === 0) return false;

    for (const month of months) {
        if (closedCache.globalMonths.has(month)) return true;
    }

    const contexts = resolveBookingRoomContexts(
        rawObjects,
        booking.propertyId,
        getBookingUnitId(booking),
    );
    if (contexts.length === 0) return false;

    for (const ctx of contexts) {
        const latestClosed = latestClosedByObjectId.get(ctx.objectId);
        if (latestClosed) {
            for (const month of months) {
                if (month <= latestClosed) return true;
            }
        }

        for (const month of months) {
            if (isLedgerPeriodClosed(closedCache, month, ctx.objectId, ctx.roomKey)) {
                return true;
            }
        }
    }

    return false;
}

export function shouldSyncBooking(
    existing: BookingSyncDoc | undefined,
    incoming: BookingSyncDoc,
    closedCache: ClosedPeriodsCache,
    latestClosedByObjectId: Map<number, string>,
    rawObjects: readonly RawBedsObjectForRoom[],
): boolean {
    if (incoming.id == null) return false;

    if (!existing) {
        return !isBookingProtectedFromSync(incoming, closedCache, latestClosedByObjectId, rawObjects);
    }

    const existingProtected = isBookingProtectedFromSync(
        existing,
        closedCache,
        latestClosedByObjectId,
        rawObjects,
    );
    const incomingProtected = isBookingProtectedFromSync(
        incoming,
        closedCache,
        latestClosedByObjectId,
        rawObjects,
    );

    return !existingProtected && !incomingProtected;
}

export type BookingSyncGuardContext = {
    closedCache: ClosedPeriodsCache;
    latestClosedByObjectId: Map<number, string>;
    rawObjects: RawBedsObjectForRoom[];
};

export async function createBookingSyncGuardContext(db: Db): Promise<BookingSyncGuardContext> {
    const [closedData, rawObjects] = await Promise.all([
        getClosedPeriodsData(db),
        db.collection('objects').find({}).toArray() as Promise<RawBedsObjectForRoom[]>,
    ]);

    return {
        closedCache: buildClosedPeriodsCache(closedData),
        latestClosedByObjectId: buildLatestClosedMonthByObjectId(closedData),
        rawObjects,
    };
}

import type { Db } from 'mongodb';
import {
    getClosedPeriodsCache,
    isLedgerPeriodClosed,
    type ClosedPeriodsCache,
} from '@/lib/accountancyClosedMonth';
import {
    getBookingUnitId,
    resolveBookingRoomContexts,
    type BookingSyncDoc,
} from '@/lib/beds24/bookingSyncGuard';
import { bookingArrivalIsoDate, isBookingBeforeSyncWindow } from '@/lib/beds24/bookingSyncWindow';
import { replaceCollection } from '@/lib/beds24/replaceCollection';
import type { RawBedsObjectForRoom } from '@/lib/roomBinding';

export const BEDS24_SYNC_JOURNAL_COLLECTION = 'beds24SyncJournal';
const SKIPPED_LIMIT = 400;

export type BookingSyncSkipReason = 'before_window' | 'frozen_existing' | 'closed_period';

export type BookingSyncSkip = {
    bookingId: number | null;
    guestName: string;
    arrival: string | null;
    departure: string | null;
    reason: BookingSyncSkipReason;
    reportMonth?: string;
    roomKey?: string;
};

export type BookingSyncMergeResult = {
    kept: number;
    replaced: number;
    preservedClosed: number;
    skipped: BookingSyncSkip[];
    skippedTotal: number;
};

type SyncDoc = BookingSyncDoc & Record<string, unknown>;

function monthKey(value: unknown): string | null {
    const iso = bookingArrivalIsoDate(value);
    return iso ? iso.slice(0, 7) : null;
}

function guestName(doc: SyncDoc): string {
    const first = typeof doc.firstName === 'string' ? doc.firstName.trim() : '';
    const last = typeof doc.lastName === 'string' ? doc.lastName.trim() : '';
    return [first, last].filter(Boolean).join(' ');
}

function bookingIdOf(doc: SyncDoc): number | null {
    const id = Number(doc.id);
    return Number.isFinite(id) ? id : null;
}

function closedPeriodHit(
    doc: SyncDoc,
    rawObjects: readonly RawBedsObjectForRoom[],
    cache: ClosedPeriodsCache,
): { reportMonth: string; roomKey?: string } | null {
    const months = [monthKey(doc.departure), monthKey(doc.arrival)].filter(
        (month, index, all): month is string => month != null && all.indexOf(month) === index,
    );
    if (months.length === 0) return null;

    const contexts = resolveBookingRoomContexts(
        rawObjects,
        typeof doc.propertyId === 'number' ? doc.propertyId : undefined,
        getBookingUnitId(doc),
    );

    for (const reportMonth of months) {
        if (cache.globalMonths.has(reportMonth)) return { reportMonth };
        for (const context of contexts) {
            if (isLedgerPeriodClosed(cache, reportMonth, context.objectId, context.roomKey)) {
                return { reportMonth, roomKey: context.roomKey };
            }
        }
    }
    return null;
}

function skipFrom(doc: SyncDoc, reason: BookingSyncSkipReason, extra?: { reportMonth?: string; roomKey?: string }): BookingSyncSkip {
    return {
        bookingId: bookingIdOf(doc),
        guestName: guestName(doc),
        arrival: bookingArrivalIsoDate(doc.arrival),
        departure: bookingArrivalIsoDate(doc.departure),
        reason,
        ...extra,
    };
}

/**
 * Брони с заездом до текущего месяца не перезаписываются.
 * Бронь, чей заезд или выезд попадает в закрытый отчётный период комнаты, не добавляется и не меняется.
 */
export async function mergeBookingsPreservingPast(
    db: Db,
    incomingRaw: Record<string, unknown>[],
    arrivalFrom: string,
): Promise<BookingSyncMergeResult> {
    const incoming = incomingRaw as SyncDoc[];
    const [existing, rawObjects, closedCache] = await Promise.all([
        db.collection('bookings').find({}).toArray(),
        db.collection('objects').find({}, { projection: { id: 1, roomTypes: 1 } }).toArray(),
        getClosedPeriodsCache(db),
    ]);

    const objects = rawObjects as RawBedsObjectForRoom[];
    const existingById = new Map<number, SyncDoc>();
    const frozen: SyncDoc[] = [];
    const frozenIds = new Set<number>();

    for (const doc of existing as SyncDoc[]) {
        const id = bookingIdOf(doc);
        if (id != null) existingById.set(id, doc);
        if (!isBookingBeforeSyncWindow(doc.arrival, arrivalFrom)) continue;
        frozen.push(doc);
        if (id != null) frozenIds.add(id);
    }

    const fresh: SyncDoc[] = [];
    const closedKept: SyncDoc[] = [];
    const closedKeptIds = new Set<number>();
    const skipped: BookingSyncSkip[] = [];
    let skippedTotal = 0;

    const pushSkip = (entry: BookingSyncSkip) => {
        skippedTotal += 1;
        if (skipped.length < SKIPPED_LIMIT) skipped.push(entry);
    };

    for (const doc of incoming) {
        const id = bookingIdOf(doc);
        if (id != null && frozenIds.has(id)) {
            pushSkip(skipFrom(doc, 'frozen_existing'));
            continue;
        }
        if (isBookingBeforeSyncWindow(doc.arrival, arrivalFrom)) {
            pushSkip(skipFrom(doc, 'before_window'));
            continue;
        }
        const closed = closedPeriodHit(doc, objects, closedCache);
        if (closed) {
            pushSkip(skipFrom(doc, 'closed_period', closed));
            if (id != null && existingById.has(id)) {
                closedKept.push(existingById.get(id)!);
                closedKeptIds.add(id);
            }
            continue;
        }
        fresh.push(doc);
    }

    for (const doc of existing as SyncDoc[]) {
        const id = bookingIdOf(doc);
        if (id == null || frozenIds.has(id) || closedKeptIds.has(id)) continue;
        if (isBookingBeforeSyncWindow(doc.arrival, arrivalFrom)) continue;
        if (!closedPeriodHit(doc, objects, closedCache)) continue;
        closedKept.push(doc);
        closedKeptIds.add(id);
    }

    await replaceCollection(db, 'bookings', [...frozen, ...closedKept, ...fresh]);

    return {
        kept: frozen.length,
        replaced: fresh.length,
        preservedClosed: closedKept.length,
        skipped,
        skippedTotal,
    };
}

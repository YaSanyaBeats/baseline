import type { Db } from 'mongodb';
import type { BookingManagementCommissionRate } from '@/lib/types';
import {
    getBookingUnitId,
    resolveBookingRoomContexts,
    type BookingSyncDoc,
} from '@/lib/beds24/bookingSyncGuard';
import { getNightsCount, getDefaultManagementCommissionPercent } from '@/lib/commissionCalculation';
import type { CommissionSchemeId, ManagementCommissionPercent } from '@/lib/commissionCalculation';
import { searchBookingsFromDb } from '@/lib/server/bookingsQuery';
import { getObjects } from '@/lib/server/getObjects';
import { stableAccountancyRoomLabel } from '@/lib/accountancyObjectGroups';
import type { RawBedsObjectForRoom } from '@/lib/roomBinding';
import type { RoomPeriodInput } from '@/lib/accountancyClosedMonth';

export const BOOKING_MANAGEMENT_COMMISSION_RATES_COLLECTION = 'bookingManagementCommissionRates';

export type CommissionRateDoc = Omit<BookingManagementCommissionRate, '_id'> & { _id?: unknown };

const VALID_PERCENTS: ManagementCommissionPercent[] = [15, 20, 25, 30];
const DEFAULT_SCHEME_ID: CommissionSchemeId = 2;

export function toClientRate(doc: CommissionRateDoc): BookingManagementCommissionRate {
    return {
        bookingId: doc.bookingId,
        percent: doc.percent,
        reportMonth: doc.reportMonth,
        nights: doc.nights,
        source: doc.source,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy,
    };
}

function isManualRate(doc: { reportMonth?: string | null }): boolean {
    const rm = doc.reportMonth;
    return rm == null || String(rm).trim() === '';
}

export function isValidCommissionPercent(value: unknown): value is ManagementCommissionPercent {
    return VALID_PERCENTS.includes(Number(value) as ManagementCommissionPercent);
}

export async function ensureCommissionRateIndexes(db: Db): Promise<void> {
    const collection = db.collection(BOOKING_MANAGEMENT_COMMISSION_RATES_COLLECTION);
    try {
        const indexes = await collection.indexes();
        for (const idx of indexes) {
            const key = idx.key as Record<string, number> | undefined;
            if (!key || key.bookingId !== 1) continue;
            const names = Object.keys(key);
            if (names.length === 1 && idx.name) {
                await collection.dropIndex(idx.name);
            }
        }
    } catch {
        // коллекция или индекс могут отсутствовать
    }
    await collection.createIndex(
        { bookingId: 1, reportMonth: 1 },
        { unique: true, name: 'bookingId_reportMonth_unique' },
    );
}

export function pickCommissionRateForMonth(
    rates: readonly Pick<BookingManagementCommissionRate, 'bookingId' | 'percent' | 'reportMonth' | 'nights'>[],
    bookingId: number,
    monthKey?: string | null,
): (typeof rates)[number] | undefined {
    const forBooking = rates.filter((r) => r.bookingId === bookingId);
    if (monthKey) {
        const frozen = forBooking.find((r) => r.reportMonth === monthKey);
        if (frozen) return frozen;
    }
    return forBooking.find((r) => isManualRate(r));
}

export function buildCommissionRatesByBookingId(
    rates: BookingManagementCommissionRate[],
    monthKey?: string | null,
): Record<number, BookingManagementCommissionRate> {
    const ids = new Set(rates.map((r) => r.bookingId));
    const out: Record<number, BookingManagementCommissionRate> = {};
    for (const id of ids) {
        const picked = pickCommissionRateForMonth(rates, id, monthKey);
        if (picked) out[id] = picked as BookingManagementCommissionRate;
    }
    return out;
}

function monthOverlapIsoRange(monthKey: string): { overlapFrom: string; overlapTo: string } {
    const [y, m] = monthKey.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
        return { overlapFrom: `${monthKey}-01`, overlapTo: `${monthKey}-28` };
    }
    const last = new Date(y, m, 0).getDate();
    return {
        overlapFrom: `${y}-${String(m).padStart(2, '0')}-01`,
        overlapTo: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    };
}

function roomsSet(rooms: RoomPeriodInput[]): Set<string> {
    return new Set(rooms.map((r) => `${r.objectId}:${r.roomKey}`));
}

function schemeForClosedRoom(
    objects: Awaited<ReturnType<typeof getObjects>>,
    objectId: number,
    roomKey: string,
): CommissionSchemeId {
    const obj = objects.find((o) => o.id === objectId);
    const room = obj?.roomTypes?.find((rt) => stableAccountancyRoomLabel(rt) === roomKey);
    const scheme = room?.commissionSchemeId;
    return scheme != null && scheme >= 1 && scheme <= 4 ? (scheme as CommissionSchemeId) : DEFAULT_SCHEME_ID;
}

async function bookingsForClosedRooms(
    db: Db,
    reportMonth: string,
    rooms: RoomPeriodInput[],
): Promise<{ bookings: BookingSyncDoc[]; rawObjects: RawBedsObjectForRoom[] }> {
    if (rooms.length === 0) return { bookings: [], rawObjects: [] };

    const { overlapFrom, overlapTo } = monthOverlapIsoRange(reportMonth);
    const [found, rawObjects] = await Promise.all([
        searchBookingsFromDb(db, { overlapFrom, overlapTo }),
        db.collection('objects').find({}).toArray() as Promise<RawBedsObjectForRoom[]>,
    ]);

    const wanted = roomsSet(rooms);
    const bookings: BookingSyncDoc[] = [];

    for (const booking of found) {
        const doc = booking as BookingSyncDoc;
        const contexts = resolveBookingRoomContexts(
            rawObjects,
            doc.propertyId,
            getBookingUnitId(doc),
        );
        if (contexts.some((ctx) => wanted.has(`${ctx.objectId}:${ctx.roomKey}`))) {
            bookings.push(doc);
        }
    }

    return { bookings, rawObjects };
}

export async function freezeBookingCommissionRatesForRooms(
    db: Db,
    reportMonth: string,
    rooms: RoomPeriodInput[],
    updatedBy?: string,
): Promise<number> {
    const { bookings, rawObjects } = await bookingsForClosedRooms(db, reportMonth, rooms);
    if (bookings.length === 0) return 0;

    await ensureCommissionRateIndexes(db);

    const bookingIds = bookings.map((b) => Number(b.id)).filter((id) => Number.isFinite(id));
    const collection = db.collection<CommissionRateDoc>(BOOKING_MANAGEMENT_COMMISSION_RATES_COLLECTION);
    const [existingRates, objects] = await Promise.all([
        collection.find({ bookingId: { $in: bookingIds } }).toArray(),
        getObjects(),
    ]);

    const wanted = roomsSet(rooms);
    const now = new Date();
    let upserted = 0;

    for (const booking of bookings) {
        const bookingId = Number(booking.id);
        if (!Number.isFinite(bookingId)) continue;

        const alreadyFrozen = existingRates.find(
            (r) => r.bookingId === bookingId && r.reportMonth === reportMonth,
        );
        if (alreadyFrozen) continue;

        const contexts = resolveBookingRoomContexts(
            rawObjects,
            booking.propertyId,
            getBookingUnitId(booking),
        );
        const closedCtx = contexts.find((ctx) => wanted.has(`${ctx.objectId}:${ctx.roomKey}`));
        const scheme = closedCtx
            ? schemeForClosedRoom(objects, closedCtx.objectId, closedCtx.roomKey)
            : DEFAULT_SCHEME_ID;

        const nights = getNightsCount(booking.arrival, booking.departure);
        const manual = pickCommissionRateForMonth(existingRates, bookingId, null);
        const computed = getDefaultManagementCommissionPercent(scheme, nights);
        const percent = isValidCommissionPercent(manual?.percent) ? manual.percent : computed;

        await collection.updateOne(
            { bookingId, reportMonth },
            {
                $setOnInsert: {
                    bookingId,
                    reportMonth,
                    percent,
                    nights,
                    source: 'period_lock',
                    createdAt: now,
                    updatedAt: now,
                    ...(updatedBy ? { updatedBy } : {}),
                },
            },
            { upsert: true },
        );
        upserted += 1;
    }

    return upserted;
}

export async function unfreezeBookingCommissionRatesForRooms(
    db: Db,
    reportMonth: string,
    rooms: RoomPeriodInput[],
): Promise<number> {
    const { bookings } = await bookingsForClosedRooms(db, reportMonth, rooms);
    const bookingIds = bookings.map((b) => Number(b.id)).filter((id) => Number.isFinite(id));
    if (bookingIds.length === 0) return 0;

    const result = await db.collection(BOOKING_MANAGEMENT_COMMISSION_RATES_COLLECTION).deleteMany({
        reportMonth,
        bookingId: { $in: bookingIds },
        source: 'period_lock',
    });
    return result.deletedCount ?? 0;
}

export async function loadCommissionRatesForMonth(
    db: Db,
    bookingIds: number[],
    monthKey?: string | null,
): Promise<BookingManagementCommissionRate[]> {
    if (bookingIds.length === 0) return [];
    const docs = await db
        .collection<CommissionRateDoc>(BOOKING_MANAGEMENT_COMMISSION_RATES_COLLECTION)
        .find({ bookingId: { $in: bookingIds } })
        .toArray();
    const picked = buildCommissionRatesByBookingId(docs.map(toClientRate), monthKey);
    return Object.values(picked);
}

export async function loadAllCommissionRatesForMonth(
    db: Db,
    monthKey: string,
): Promise<Map<number, BookingManagementCommissionRate>> {
    const docs = await db
        .collection<CommissionRateDoc>(BOOKING_MANAGEMENT_COMMISSION_RATES_COLLECTION)
        .find({
            $or: [{ reportMonth: monthKey }, { reportMonth: null }, { reportMonth: { $exists: false } }],
        })
        .toArray();
    const picked = buildCommissionRatesByBookingId(docs.map(toClientRate), monthKey);
    return new Map(Object.entries(picked).map(([id, rate]) => [Number(id), rate]));
}

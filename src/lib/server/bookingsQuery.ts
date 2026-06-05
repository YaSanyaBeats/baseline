import type { Db } from 'mongodb';
import type { Booking } from '@/lib/types';
import type { BookingSearchParams } from '@/lib/bookings';

function startOfUtcDayFromIsoDate(iso: string): Date {
    const parts = iso.trim().split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
        return new Date(iso);
    }
    const [y, m, d] = parts;
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function endOfUtcDayFromIsoDate(iso: string): Date {
    const parts = iso.trim().split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
        return new Date(iso);
    }
    const [y, m, d] = parts;
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function searchBookingsFromDb(
    db: Db,
    params: BookingSearchParams
): Promise<Booking[]> {
    const { objectId, objectIds, roomId, query, text, from, to, overlapFrom, overlapTo } = params;
    const searchStr = (text ?? query)?.trim();
    const bookingsCollection = db.collection('bookings');
    const andParts: object[] = [];

    const objectIdsList = objectIds?.length
        ? objectIds.filter((n) => Number.isFinite(n))
        : [];
    if (objectIds != null && objectIds.length > 0 && objectIdsList.length === 0) {
        return [];
    }
    if (objectIdsList.length > 0) {
        andParts.push(
            objectIdsList.length === 1
                ? { propertyId: objectIdsList[0]! }
                : { propertyId: { $in: objectIdsList } }
        );
    } else if (objectId != null) {
        andParts.push({ propertyId: Number(objectId) });
    }

    if (roomId != null) {
        const rid = Number(roomId);
        if (Number.isFinite(rid)) {
            andParts.push({
                $or: [{ unitId: rid }, { roomId: rid }, { roomID: rid }],
            });
        }
    }

    if (overlapFrom && overlapTo) {
        const arrivalDate = {
            $toDate: { $ifNull: ['$arrival', '1970-01-01'] },
        };
        const departureDate = {
            $toDate: { $ifNull: ['$departure', '9999-12-31'] },
        };
        const rangeStart = startOfUtcDayFromIsoDate(overlapFrom);
        const rangeEnd = endOfUtcDayFromIsoDate(overlapTo);
        andParts.push({
            $expr: {
                $and: [{ $lte: [arrivalDate, rangeEnd] }, { $gte: [departureDate, rangeStart] }],
            },
        });
    } else if (from || to) {
        const arrivalDate = {
            $toDate: { $ifNull: ['$arrival', '1970-01-01'] },
        };
        const exprParts: object[] = [];
        if (from) {
            exprParts.push({
                $gte: [arrivalDate, startOfUtcDayFromIsoDate(from)],
            });
        }
        if (to) {
            exprParts.push({
                $lte: [arrivalDate, endOfUtcDayFromIsoDate(to)],
            });
        }
        andParts.push({
            $expr: exprParts.length === 1 ? exprParts[0] : { $and: exprParts },
        });
    }

    if (searchStr) {
        const regex = new RegExp(escapeRegExp(searchStr), 'i');
        const orBranches: object[] = [
            { title: regex },
            { firstName: regex },
            { lastName: regex },
            { referer: regex },
            { refererEditable: regex },
            { apiReference: regex },
            { reference: regex },
            { phone: regex },
            { mobile: regex },
            { email: regex },
            { comments: regex },
            { notes: regex },
            { message: regex },
            { channel: regex },
            { 'guests.firstName': regex },
            { 'guests.lastName': regex },
            { 'guests.email': regex },
        ];
        if (/^\d+$/.test(searchStr)) {
            orBranches.push({ id: Number(searchStr) });
        }
        andParts.push({ $or: orBranches });
    }

    const filter =
        andParts.length === 0
            ? {}
            : andParts.length === 1
              ? andParts[0]!
              : { $and: andParts };

    const resultLimit = Math.min(5000, objectIdsList.length > 1 ? 200 * objectIdsList.length : 200);

    const bookings = await bookingsCollection
        .find(filter)
        .sort({ arrival: -1 })
        .limit(resultLimit)
        .toArray();

    return bookings as unknown as Booking[];
}

export async function getBookingsByIdsFromDb(db: Db, ids: number[]): Promise<Booking[]> {
    if (!ids.length) return [];

    const bookings = await db
        .collection('bookings')
        .find(
            { id: { $in: ids } },
            {
                projection: {
                    id: 1,
                    propertyId: 1,
                    unitId: 1,
                    arrival: 1,
                    departure: 1,
                    title: 1,
                    firstName: 1,
                    lastName: 1,
                    status: 1,
                    referer: 1,
                    refererEditable: 1,
                    channel: 1,
                    invoiceItems: 1,
                    numAdult: 1,
                    numChild: 1,
                    comments: 1,
                    notes: 1,
                    message: 1,
                },
            } as Record<string, unknown>
        )
        .toArray();

    return bookings as unknown as Booking[];
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';

/** `type="date"` отдаёт YYYY-MM-DD; инклюзивный календарный диапазон в UTC (без схлопывания «один день» в один момент времени). */
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

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as any).role;
        const hasCashflow = Boolean((session.user as any).hasCashflow);
        const hasAccess = userRole === 'admin' || userRole === 'accountant' || hasCashflow || userRole === 'owner';
        if (!hasAccess) {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const db = await getDB();
        const searchParams = request.nextUrl.searchParams;

        const objectIdParam = searchParams.get('objectId');
        /** Список propertyId через запятую: один find вместо нескольких запросов. */
        const objectIdsParam = (searchParams.get('objectIds') || '').trim();
        const textRaw = (searchParams.get('text') || searchParams.get('query') || '').trim();
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        /** Пересечение проживания с [overlapFrom, overlapTo] (инкл. по календарным дням UTC); приоритетнее фильтра `from`/`to` по дате заезда. */
        const overlapFrom = searchParams.get('overlapFrom');
        const overlapTo = searchParams.get('overlapTo');
        /** ID комнаты (room type / unit в справочнике объекта): совпадение с unitId или roomId в документе брони */
        const roomIdParam = searchParams.get('roomId');

        const bookingsCollection = db.collection('bookings');

        const andParts: object[] = [];

        const objectIdsList = objectIdsParam
            ? objectIdsParam
                  .split(',')
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isFinite(n))
            : [];
        if (objectIdsParam && objectIdsList.length === 0) {
            return NextResponse.json([]);
        }
        if (objectIdsList.length > 0) {
            andParts.push(
                objectIdsList.length === 1
                    ? { propertyId: objectIdsList[0]! }
                    : { propertyId: { $in: objectIdsList } },
            );
        } else if (objectIdParam) {
            andParts.push({ propertyId: Number(objectIdParam) });
        }

        if (roomIdParam) {
            const rid = Number(roomIdParam);
            if (Number.isFinite(rid)) {
                andParts.push({
                    $or: [{ unitId: rid }, { roomId: rid }, { roomID: rid }],
                });
            }
        }

        /** В Mongo после синка Beds24 даты часто строки (YYYY-MM-DD); прямое $gte/$lte с BSON Date не совпадает по типу. */
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

        if (textRaw) {
            const regex = new RegExp(escapeRegExp(textRaw), 'i');
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
            if (/^\d+$/.test(textRaw)) {
                orBranches.push({ id: Number(textRaw) });
            }
            andParts.push({ $or: orBranches });
        }

        const filter: any =
            andParts.length === 0 ? {} : andParts.length === 1 ? andParts[0] : { $and: andParts };

        /** Один PID — 200, как раньше; несколько — пропорционально, с потолком. */
        const resultLimit = Math.min(5000, objectIdsList.length > 1 ? 200 * objectIdsList.length : 200);

        const bookings = await bookingsCollection
            .find(filter)
            .sort({ arrival: -1 })
            .limit(resultLimit)
            .toArray();

        return NextResponse.json(bookings);
    } catch (error) {
        console.error('Error in GET /api/bookings/search:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}


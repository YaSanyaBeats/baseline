import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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
        const textRaw = (searchParams.get('text') || searchParams.get('query') || '').trim();
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        const bookingsCollection = db.collection('bookings');

        const andParts: object[] = [];

        if (objectIdParam) {
            andParts.push({ propertyId: Number(objectIdParam) });
        }

        /** В Mongo после синка Beds24 `arrival` часто строка (YYYY-MM-DD); прямое $gte/$lte с BSON Date не совпадает по типу. */
        if (from || to) {
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

        const bookings = await bookingsCollection
            .find(filter)
            .sort({ arrival: -1 })
            .limit(200)
            .toArray();

        return NextResponse.json(bookings);
    } catch (error) {
        console.error('Error in GET /api/bookings/search:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}


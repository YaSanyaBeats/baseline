import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';

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
        const idsParam = searchParams.get('ids');

        if (!idsParam) {
            return NextResponse.json(
                { success: false, message: 'ids parameter is required' },
                { status: 400 },
            );
        }

        const ids = idsParam
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => Number(s))
            .filter((n) => !Number.isNaN(n));

        if (ids.length === 0) {
            return NextResponse.json([]);
        }

        const bookingsCollection = db.collection('bookings');

        const bookings = await bookingsCollection
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
                    },
                } as any,
            )
            .toArray();

        return NextResponse.json(bookings);
    } catch (error) {
        console.error('Error in GET /api/bookings/byIds:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}


import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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

        const propertyIdParam =
            searchParams.get('roomInfo[object][propertyId]') ?? searchParams.get('roomInfo[object][id]');
        const roomID = searchParams.get('roomInfo[room][id]');
        const bookings = db.collection('bookings');

        if (!propertyIdParam || !roomID) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const neededBookings = await bookings.find({
            propertyId: +propertyIdParam,
            unitId: +roomID
        }).sort({
            arrival: -1
        }).toArray();

        return NextResponse.json(neededBookings);
    } catch (error) {
        console.error('Error in GET /api/bookings:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

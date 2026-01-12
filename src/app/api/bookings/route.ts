import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';

export async function GET(request: NextRequest) {
    try {
        const db = await getDB();
        const searchParams = request.nextUrl.searchParams;
        
        const objectID = searchParams.get('roomInfo[object][id]');
        const roomID = searchParams.get('roomInfo[room][id]');
        const bookings = db.collection('bookings');

        if (!objectID || !roomID) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const neededBookings = await bookings.find({
            propertyId: +objectID,
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

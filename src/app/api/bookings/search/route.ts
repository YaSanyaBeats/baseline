import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';

export async function GET(request: NextRequest) {
    try {
        const db = await getDB();
        const searchParams = request.nextUrl.searchParams;

        const objectIdParam = searchParams.get('objectId');
        const query = searchParams.get('query') || '';
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        const bookingsCollection = db.collection('bookings');

        const filter: any = {};

        if (objectIdParam) {
            filter.propertyId = Number(objectIdParam);
        }

        if (from || to) {
            filter.arrival = {};
            if (from) {
                filter.arrival.$gte = new Date(from);
            }
            if (to) {
                filter.arrival.$lte = new Date(to);
            }
        }

        if (query) {
            const regex = new RegExp(query, 'i');
            filter.$or = [
                { title: regex },
                { firstName: regex },
                { lastName: regex },
            ];
        }

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


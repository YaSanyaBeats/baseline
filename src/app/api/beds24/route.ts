import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';

export async function GET() {
    try {
        const db = await getDB();
        const beds24Collection = db.collection('beds24');
        
        // Получаем документ с временем последней синхронизации
        const syncInfo = await beds24Collection.findOne({});
        
        return NextResponse.json({
            success: true,
            data: syncInfo || {
                objects: null,
                prices: null,
                bookings: null
            }
        });
    } catch (error) {
        console.error('Error in GET /api/beds24:', error);
        return NextResponse.json({ 
            success: false,
            error: 'Internal server error' 
        }, { status: 500 });
    }
}

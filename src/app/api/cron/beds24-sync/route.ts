import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron-эндпоинт для автоматической синхронизации Beds24: Objects и Bookings раз в 6 часов.
 * Защита: заголовок Authorization: Bearer <CRON_SECRET> или query-параметр secret=<CRON_SECRET>.
 */
export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    const secretParam = request.nextUrl.searchParams.get('secret');

    const isValid =
        cronSecret &&
        (authHeader === `Bearer ${cronSecret}` || secretParam === cronSecret);

    if (!isValid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const baseUrl =
        process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.APP_URL || 'http://localhost:3000';

    try {
        // Последовательно запускаем синхронизацию Objects, затем Bookings
        const objectsRes = await fetch(`${baseUrl}/api/sync?type=objects`);
        if (!objectsRes.ok) {
            console.error('Beds24 cron: objects sync request failed', objectsRes.status);
        }

        const bookingsRes = await fetch(`${baseUrl}/api/sync?type=bookings`);
        if (!bookingsRes.ok) {
            console.error('Beds24 cron: bookings sync request failed', bookingsRes.status);
        }

        return NextResponse.json({
            success: true,
            message: 'Beds24 auto-sync (objects + bookings) triggered',
        });
    } catch (error) {
        console.error('Beds24 cron error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

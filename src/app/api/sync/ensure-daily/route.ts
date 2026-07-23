import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Пока идёт синхронизация — не запускать повторно */
const LOCK_MS = 60 * 60 * 1000;

function isStale(value: unknown): boolean {
    if (value == null) return true;
    const ts = new Date(value as string | Date).getTime();
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts >= DAY_MS;
}

function getBaseUrl(): string {
    return process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000';
}

/**
 * При входе в дашборд: если objects/bookings не синхронизировались сутки — запускает sync.
 * Защита от гонок: dailySyncLockAt в коллекции beds24.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = await getDB();
        const beds24Collection = db.collection('beds24');
        const syncInfo = await beds24Collection.findOne({});

        const needObjects = isStale(syncInfo?.objects);
        const needBookings = isStale(syncInfo?.bookings);

        if (!needObjects && !needBookings) {
            return NextResponse.json({
                success: true,
                triggered: false,
                reason: 'fresh',
            });
        }

        const lockAt = syncInfo?.dailySyncLockAt
            ? new Date(syncInfo.dailySyncLockAt as string | Date).getTime()
            : 0;
        if (Number.isFinite(lockAt) && Date.now() - lockAt < LOCK_MS) {
            return NextResponse.json({
                success: true,
                triggered: false,
                reason: 'in_progress',
            });
        }

        await beds24Collection.updateOne(
            {},
            { $set: { dailySyncLockAt: new Date() } },
            { upsert: true },
        );

        const baseUrl = getBaseUrl();
        const types: string[] = [];
        if (needObjects) types.push('objects');
        if (needBookings) types.push('bookings');

        // Fire-and-forget: /api/sync сам отвечает сразу и крутит sync в фоне
        void (async () => {
            try {
                for (const type of types) {
                    const res = await fetch(`${baseUrl}/api/sync?type=${type}`);
                    if (!res.ok) {
                        console.error(`ensure-daily: sync ${type} failed`, res.status);
                    }
                }
            } catch (error) {
                console.error('ensure-daily: sync trigger failed', error);
            }
        })();

        return NextResponse.json({
            success: true,
            triggered: true,
            types,
        });
    } catch (error) {
        console.error('Error in GET /api/sync/ensure-daily:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

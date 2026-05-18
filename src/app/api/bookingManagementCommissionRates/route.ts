import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import type { BookingManagementCommissionRate } from '@/lib/types';
import { normalizeMongoIdString } from '@/lib/mongoId';

type RateDb = Omit<BookingManagementCommissionRate, '_id'> & { _id?: ObjectId };

const VALID_PERCENTS = [15, 20, 25, 30] as const;

function canManage(session: unknown): boolean {
    const role = (session as { user?: { role?: string } })?.user?.role;
    return role === 'accountant' || role === 'admin';
}

function parseBookingIds(raw: string | null): number[] {
    if (!raw) return [];
    return Array.from(
        new Set(
            raw
                .split(',')
                .map((x) => Number(x.trim()))
                .filter((x) => Number.isInteger(x) && x > 0),
        ),
    );
}

function parsePercent(value: unknown): BookingManagementCommissionRate['percent'] | null {
    const n = Number(value);
    return VALID_PERCENTS.includes(n as BookingManagementCommissionRate['percent'])
        ? (n as BookingManagementCommissionRate['percent'])
        : null;
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
        }
        if (!canManage(session)) {
            return NextResponse.json({ success: false, message: 'Недостаточно прав' }, { status: 403 });
        }

        const bookingIds = parseBookingIds(request.nextUrl.searchParams.get('bookingIds'));
        if (bookingIds.length === 0) {
            return NextResponse.json([], {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                    Pragma: 'no-cache',
                },
            });
        }

        const db = await getDB();
        const docs = await db
            .collection<RateDb>('bookingManagementCommissionRates')
            .find({ bookingId: { $in: bookingIds } })
            .toArray();

        const serialized = docs.map((doc) => ({
            ...doc,
            _id: doc._id ? normalizeMongoIdString(doc._id) : undefined,
        }));

        return NextResponse.json(serialized, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                Pragma: 'no-cache',
            },
        });
    } catch (error) {
        console.error('Error in GET /api/bookingManagementCommissionRates:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
        }
        if (!canManage(session)) {
            return NextResponse.json({ success: false, message: 'Недостаточно прав' }, { status: 403 });
        }

        const body = await request.json();
        const bookingId = Number(body?.bookingId ?? body?.params?.bookingId);
        const percent = parsePercent(body?.percent ?? body?.params?.percent);
        if (!Number.isInteger(bookingId) || bookingId <= 0 || percent == null) {
            return NextResponse.json(
                { success: false, message: 'Некорректные ID брони или процент комиссии' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<RateDb>('bookingManagementCommissionRates');
        await collection.createIndex({ bookingId: 1 }, { unique: true });

        const now = new Date();
        const updatedBy = (session.user as { _id?: unknown })._id?.toString?.() ?? String((session.user as { _id?: unknown })._id ?? '');
        await collection.updateOne(
            { bookingId },
            {
                $set: {
                    bookingId,
                    percent,
                    updatedAt: now,
                    ...(updatedBy ? { updatedBy } : {}),
                },
                $setOnInsert: { createdAt: now },
            },
            { upsert: true },
        );

        return NextResponse.json({
            success: true,
            message: 'Процент комиссии сохранён',
        });
    } catch (error) {
        console.error('Error in POST /api/bookingManagementCommissionRates:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

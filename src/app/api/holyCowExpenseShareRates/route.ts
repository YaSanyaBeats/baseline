import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { normalizeMongoIdString } from '@/lib/mongoId';
import type { HolyCowExpenseShareRate } from '@/lib/types';
import { isReportMonthClosed, REPORT_MONTH_CLOSED_MESSAGE } from '@/lib/accountancyClosedMonth';

type RateDb = Omit<HolyCowExpenseShareRate, '_id'> & { _id?: ObjectId };

const VALID_PERCENTS = [15, 20, 25, 30] as const;

function canManage(session: unknown): boolean {
    const role = (session as { user?: { role?: string } })?.user?.role;
    return role === 'accountant' || role === 'admin';
}

function parsePercent(value: unknown): HolyCowExpenseShareRate['percent'] | null {
    const n = Number(value);
    return VALID_PERCENTS.includes(n as HolyCowExpenseShareRate['percent'])
        ? (n as HolyCowExpenseShareRate['percent'])
        : null;
}

function parseKey(raw: Record<string, unknown>): Pick<HolyCowExpenseShareRate, 'objectId' | 'roomName' | 'reportMonth'> | null {
    const objectId = Number(raw.objectId);
    const roomName = typeof raw.roomName === 'string' ? raw.roomName.trim() : '';
    const reportMonth = typeof raw.reportMonth === 'string' ? raw.reportMonth.trim() : '';
    if (!Number.isInteger(objectId) || objectId <= 0 || !roomName || !/^\d{4}-\d{2}$/.test(reportMonth)) {
        return null;
    }
    return { objectId, roomName, reportMonth };
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

        const key = parseKey({
            objectId: request.nextUrl.searchParams.get('objectId'),
            roomName: request.nextUrl.searchParams.get('roomName'),
            reportMonth: request.nextUrl.searchParams.get('reportMonth'),
        });
        if (!key) {
            return NextResponse.json(null, {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                    Pragma: 'no-cache',
                },
            });
        }

        const db = await getDB();
        const doc = await db.collection<RateDb>('holyCowExpenseShareRates').findOne(key);
        const serialized = doc
            ? {
                  ...doc,
                  _id: doc._id ? normalizeMongoIdString(doc._id) : undefined,
              }
            : null;

        return NextResponse.json(serialized, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                Pragma: 'no-cache',
            },
        });
    } catch (error) {
        console.error('Error in GET /api/holyCowExpenseShareRates:', error);
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
        const key = parseKey(body ?? {});
        const percent = parsePercent(body?.percent);
        if (!key || percent == null) {
            return NextResponse.json(
                { success: false, message: 'Некорректные объект, комната, месяц или процент' },
                { status: 400 },
            );
        }

        const db = await getDB();
        if (await isReportMonthClosed(db, key.reportMonth)) {
            return NextResponse.json(
                { success: false, message: REPORT_MONTH_CLOSED_MESSAGE, code: 'REPORT_MONTH_CLOSED' },
                { status: 403 },
            );
        }
        const collection = db.collection<RateDb>('holyCowExpenseShareRates');
        await collection.createIndex({ objectId: 1, roomName: 1, reportMonth: 1 }, { unique: true });

        const now = new Date();
        const updatedBy =
            (session.user as { _id?: unknown })._id?.toString?.() ??
            String((session.user as { _id?: unknown })._id ?? '');
        await collection.updateOne(
            key,
            {
                $set: {
                    ...key,
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
            message: 'Процент доли расходов HC сохранён',
        });
    } catch (error) {
        console.error('Error in POST /api/holyCowExpenseShareRates:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

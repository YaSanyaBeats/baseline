import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import type { BookingManagementCommissionRate } from '@/lib/types';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { isReportMonthClosed, isValidReportMonthKey, REPORT_MONTH_CLOSED_MESSAGE } from '@/lib/accountancyClosedMonth';
import {
    BOOKING_MANAGEMENT_COMMISSION_RATES_COLLECTION,
    buildCommissionRatesByBookingId,
    ensureCommissionRateIndexes,
    isValidCommissionPercent,
    toClientRate,
    type CommissionRateDoc,
} from '@/lib/server/bookingManagementCommissionRates';

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

function noStoreHeaders() {
    return {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
    };
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
            return NextResponse.json([], { headers: noStoreHeaders() });
        }

        const reportMonthRaw = String(request.nextUrl.searchParams.get('reportMonth') ?? '').trim();
        const monthKey = isValidReportMonthKey(reportMonthRaw) ? reportMonthRaw : null;

        const db = await getDB();
        await ensureCommissionRateIndexes(db);
        const docs = await db
            .collection<CommissionRateDoc>(BOOKING_MANAGEMENT_COMMISSION_RATES_COLLECTION)
            .find({ bookingId: { $in: bookingIds } })
            .toArray();

        const serialized = docs.map((doc) => ({
            ...toClientRate(doc),
            _id: doc._id ? normalizeMongoIdString(doc._id) : undefined,
        }));

        const payload = monthKey
            ? Object.values(buildCommissionRatesByBookingId(serialized, monthKey))
            : serialized;

        return NextResponse.json(payload, { headers: noStoreHeaders() });
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
        const percent = isValidCommissionPercent(body?.percent ?? body?.params?.percent)
            ? (Number(body?.percent ?? body?.params?.percent) as BookingManagementCommissionRate['percent'])
            : null;
        const reportMonthRaw = String(body?.reportMonth ?? body?.params?.reportMonth ?? '').trim();
        if (!Number.isInteger(bookingId) || bookingId <= 0 || percent == null) {
            return NextResponse.json(
                { success: false, message: 'Некорректные ID брони или процент комиссии' },
                { status: 400 },
            );
        }

        const db = await getDB();
        if (isValidReportMonthKey(reportMonthRaw) && (await isReportMonthClosed(db, reportMonthRaw))) {
            return NextResponse.json(
                { success: false, message: REPORT_MONTH_CLOSED_MESSAGE, code: 'REPORT_MONTH_CLOSED' },
                { status: 403 },
            );
        }

        const collection = db.collection<CommissionRateDoc>(BOOKING_MANAGEMENT_COMMISSION_RATES_COLLECTION);
        await ensureCommissionRateIndexes(db);

        const now = new Date();
        const updatedBy =
            (session.user as { _id?: unknown })._id?.toString?.() ??
            String((session.user as { _id?: unknown })._id ?? '');

        const existingManual = await collection.findOne({
            bookingId,
            $or: [{ reportMonth: null }, { reportMonth: { $exists: false } }],
        });

        if (existingManual?._id) {
            await collection.updateOne(
                { _id: existingManual._id as ObjectId },
                {
                    $set: {
                        bookingId,
                        percent,
                        reportMonth: null,
                        source: 'manual',
                        updatedAt: now,
                        ...(updatedBy ? { updatedBy } : {}),
                    },
                },
            );
        } else {
            await collection.insertOne({
                bookingId,
                percent,
                reportMonth: null,
                source: 'manual',
                createdAt: now,
                updatedAt: now,
                ...(updatedBy ? { updatedBy } : {}),
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Процент комиссии сохранён',
        });
    } catch (error) {
        console.error('Error in POST /api/bookingManagementCommissionRates:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

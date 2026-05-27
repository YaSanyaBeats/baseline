import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { logAuditAction } from '@/lib/auditLog';
import {
    ACCOUNTANCY_CLOSED_MONTHS_COLLECTION,
    getClosedPeriodsData,
    isValidReportMonthKey,
    parseRoomPeriodInputs,
} from '@/lib/accountancyClosedMonth';

function requireAccountantOrAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
    if (!session || !(session as { user?: unknown }).user) {
        return { ok: false as const, status: 401, message: 'Необходима авторизация' };
    }
    const userRole = ((session as { user?: { role?: string } }).user)?.role;
    if (userRole !== 'admin' && userRole !== 'accountant') {
        return { ok: false as const, status: 403, message: 'Недостаточно прав' };
    }
    return { ok: true as const, session: session as { user: { _id?: string; name?: string; role?: string } } };
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        const access = requireAccountantOrAdmin(session);
        if (!access.ok) {
            return NextResponse.json({ success: false, message: access.message }, { status: access.status });
        }

        const db = await getDB();
        const data = await getClosedPeriodsData(db);
        const months = Array.from(
            new Set([...data.globalMonths, ...data.roomPeriods.map((p) => p.reportMonth)]),
        ).sort((a, b) => b.localeCompare(a));

        return NextResponse.json({
            success: true,
            months,
            globalMonths: data.globalMonths,
            roomPeriods: data.roomPeriods,
        });
    } catch (error) {
        console.error('Error in GET /api/accountancy/closed-months:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

async function applyRoomPeriodAction(
    request: NextRequest,
    action: 'close' | 'reopen',
): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    const access = requireAccountantOrAdmin(session);
    if (!access.ok) {
        return NextResponse.json({ success: false, message: access.message }, { status: access.status });
    }

    const body = await request.json();
    const reportMonth = String(body?.reportMonth ?? '').trim();
    if (!isValidReportMonthKey(reportMonth)) {
        return NextResponse.json({ success: false, message: 'Некорректный отчётный месяц' }, { status: 400 });
    }

    const rooms = parseRoomPeriodInputs(body?.rooms);
    if (!rooms) {
        return NextResponse.json({ success: false, message: 'Укажите хотя бы одну комнату' }, { status: 400 });
    }

    const db = await getDB();
    const collection = db.collection(ACCOUNTANCY_CLOSED_MONTHS_COLLECTION);
    const userId = access.session.user._id?.toString?.() ?? '';
    const userName = access.session.user.name || 'Unknown';
    const userRole = access.session.user.role ?? '';

    if (action === 'close') {
        const now = new Date();
        let inserted = 0;
        for (const room of rooms) {
            const filter = { reportMonth, objectId: room.objectId, roomKey: room.roomKey };
            const existing = await collection.findOne(filter);
            if (existing) continue;

            const doc = {
                ...filter,
                closedAt: now,
                closedBy: userId,
                closedByName: userName,
            };
            await collection.insertOne(doc);
            inserted++;

            await logAuditAction({
                entity: 'other',
                entityId: `${reportMonth}:${room.objectId}:${room.roomKey}`,
                action: 'create',
                userId,
                userName,
                userRole,
                description: `Зафиксирован отчётный период ${reportMonth} для комнаты ${room.roomKey} (объект ${room.objectId})`,
                newData: doc,
            });
        }

        return NextResponse.json({
            success: true,
            message: inserted > 0 ? 'Отчётный период зафиксирован' : 'Выбранные периоды уже были зафиксированы',
            reportMonth,
            affected: inserted,
        });
    }

    let removed = 0;
    for (const room of rooms) {
        const filter = { reportMonth, objectId: room.objectId, roomKey: room.roomKey };
        const existing = await collection.findOne(filter);
        if (!existing) continue;

        await collection.deleteOne(filter);
        removed++;

        await logAuditAction({
            entity: 'other',
            entityId: `${reportMonth}:${room.objectId}:${room.roomKey}`,
            action: 'delete',
            userId,
            userName,
            userRole,
            description: `Снята фиксация отчётного периода ${reportMonth} для комнаты ${room.roomKey} (объект ${room.objectId})`,
            oldData: existing,
        });
    }

    if (removed === 0) {
        return NextResponse.json({ success: false, message: 'Выбранные периоды не были зафиксированы' }, { status: 404 });
    }

    return NextResponse.json({
        success: true,
        message: 'Отчётный период открыт для редактирования',
        reportMonth,
        affected: removed,
    });
}

export async function POST(request: NextRequest) {
    try {
        return await applyRoomPeriodAction(request, 'close');
    } catch (error) {
        console.error('Error in POST /api/accountancy/closed-months:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const contentType = request.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            return await applyRoomPeriodAction(request, 'reopen');
        }

        const session = await getServerSession(authOptions);
        const access = requireAccountantOrAdmin(session);
        if (!access.ok) {
            return NextResponse.json({ success: false, message: access.message }, { status: access.status });
        }

        const reportMonth = request.nextUrl.searchParams.get('reportMonth')?.trim() ?? '';
        const roomsRaw = request.nextUrl.searchParams.get('rooms');
        if (roomsRaw) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(roomsRaw);
            } catch {
                return NextResponse.json({ success: false, message: 'Некорректный список комнат' }, { status: 400 });
            }
            const rooms = parseRoomPeriodInputs(parsed);
            if (!rooms) {
                return NextResponse.json({ success: false, message: 'Укажите хотя бы одну комнату' }, { status: 400 });
            }
            return await applyRoomPeriodAction(
                new NextRequest(request.url, {
                    method: 'DELETE',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ reportMonth, rooms }),
                }),
                'reopen',
            );
        }

        if (!isValidReportMonthKey(reportMonth)) {
            return NextResponse.json({ success: false, message: 'Некорректный отчётный месяц' }, { status: 400 });
        }

        const db = await getDB();
        const collection = db.collection(ACCOUNTANCY_CLOSED_MONTHS_COLLECTION);
        const existing = await collection.findOne({ reportMonth, objectId: { $exists: false } });
        if (!existing) {
            return NextResponse.json({ success: false, message: 'Отчётный период не был зафиксирован' }, { status: 404 });
        }

        await collection.deleteOne({ _id: existing._id });

        const userId = access.session.user._id?.toString?.() ?? '';
        const userName = access.session.user.name || 'Unknown';
        const userRole = access.session.user.role ?? '';

        await logAuditAction({
            entity: 'other',
            entityId: reportMonth,
            action: 'delete',
            userId,
            userName,
            userRole,
            description: `Снята фиксация отчётного периода ${reportMonth}`,
            oldData: existing,
        });

        return NextResponse.json({
            success: true,
            message: 'Отчётный период открыт для редактирования',
            reportMonth,
        });
    } catch (error) {
        console.error('Error in DELETE /api/accountancy/closed-months:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

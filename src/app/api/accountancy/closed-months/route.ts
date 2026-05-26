import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { logAuditAction } from '@/lib/auditLog';
import {
    ACCOUNTANCY_CLOSED_MONTHS_COLLECTION,
    getClosedReportMonths,
    isValidReportMonthKey,
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
        const months = await getClosedReportMonths(db);

        return NextResponse.json({ success: true, months });
    } catch (error) {
        console.error('Error in GET /api/accountancy/closed-months:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
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

        const db = await getDB();
        const collection = db.collection(ACCOUNTANCY_CLOSED_MONTHS_COLLECTION);
        const existing = await collection.findOne({ reportMonth });
        if (existing) {
            return NextResponse.json({
                success: true,
                message: 'Отчётный период уже зафиксирован',
                reportMonth,
            });
        }

        const userId = access.session.user._id?.toString?.() ?? '';
        const userName = access.session.user.name || 'Unknown';
        const userRole = access.session.user.role ?? '';

        const doc = {
            reportMonth,
            closedAt: new Date(),
            closedBy: userId,
            closedByName: userName,
        };

        await collection.insertOne(doc);

        await logAuditAction({
            entity: 'other',
            entityId: reportMonth,
            action: 'create',
            userId,
            userName,
            userRole,
            description: `Зафиксирован отчётный период ${reportMonth}`,
            newData: doc,
        });

        return NextResponse.json({
            success: true,
            message: 'Отчётный период зафиксирован',
            reportMonth,
        });
    } catch (error) {
        console.error('Error in POST /api/accountancy/closed-months:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const access = requireAccountantOrAdmin(session);
        if (!access.ok) {
            return NextResponse.json({ success: false, message: access.message }, { status: access.status });
        }

        const reportMonth = request.nextUrl.searchParams.get('reportMonth')?.trim() ?? '';
        if (!isValidReportMonthKey(reportMonth)) {
            return NextResponse.json({ success: false, message: 'Некорректный отчётный месяц' }, { status: 400 });
        }

        const db = await getDB();
        const collection = db.collection(ACCOUNTANCY_CLOSED_MONTHS_COLLECTION);
        const existing = await collection.findOne({ reportMonth });
        if (!existing) {
            return NextResponse.json({ success: false, message: 'Отчётный период не был зафиксирован' }, { status: 404 });
        }

        await collection.deleteOne({ reportMonth });

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

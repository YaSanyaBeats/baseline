import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { logAuditAction } from '@/lib/auditLog';
import {
    AUTO_ACCOUNTING_ROOM_FIX_REPORT_MONTH,
    fixAutoAccountingRoomsForNovember2026,
} from '@/lib/migrations/fixAutoAccountingRoomsNovember2026';

async function requireAccountant() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return {
            ok: false as const,
            response: NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            ),
        };
    }
    const userRole = (session.user as { role?: string }).role;
    if (userRole !== 'admin' && userRole !== 'accountant') {
        return {
            ok: false as const,
            response: NextResponse.json(
                { success: false, message: 'Недостаточно прав. Миграция доступна только админу и бухгалтеру.' },
                { status: 403 },
            ),
        };
    }
    return { ok: true as const, session, userRole: userRole ?? '' };
}

function sessionUserId(user: unknown): string | null {
    const rawId = (user as { _id?: unknown } | null | undefined)?._id;
    if (typeof rawId === 'string' && rawId) return rawId;
    if (typeof rawId === 'object' && rawId != null && 'toString' in rawId) {
        const id = String((rawId as { toString(): string }).toString());
        return id || null;
    }
    return null;
}

export async function GET() {
    try {
        const auth = await requireAccountant();
        if (!auth.ok) return auth.response;

        const db = await getDB();
        const stats = await fixAutoAccountingRoomsForNovember2026(db, { dryRun: true });
        return NextResponse.json({ success: true, stats });
    } catch (error) {
        console.error('fix-auto-accounting-rooms GET:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

export async function POST() {
    try {
        const auth = await requireAccountant();
        if (!auth.ok) return auth.response;

        const db = await getDB();
        const stats = await fixAutoAccountingRoomsForNovember2026(db, { dryRun: false });

        const su = auth.session.user as { name?: unknown };
        const userName = typeof su.name === 'string' ? su.name : 'Unknown';
        await logAuditAction({
            entity: 'other',
            action: 'update',
            userId: sessionUserId(auth.session.user) ?? '',
            userName,
            userRole: auth.userRole,
            description:
                `Миграция комнат автоучёта за ${AUTO_ACCOUNTING_ROOM_FIX_REPORT_MONTH}: ` +
                `расходов ${stats.expensesUpdated}, доходов ${stats.incomesUpdated}, ` +
                `подтранзакций ${stats.childrenUpdated}, без изменений ${stats.alreadyCorrect}, ` +
                `без брони ${stats.missingBooking}, комната не определена ${stats.unresolvedRoom}`,
        });

        const message =
            stats.expensesUpdated + stats.incomesUpdated === 0
                ? `За ${AUTO_ACCOUNTING_ROOM_FIX_REPORT_MONTH} нечего перепривязывать.`
                : `Обновлено расходов: ${stats.expensesUpdated}, доходов: ${stats.incomesUpdated}.`;

        return NextResponse.json({
            success: stats.errors.length === 0,
            message,
            stats,
        });
    } catch (error) {
        console.error('fix-auto-accounting-rooms POST:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

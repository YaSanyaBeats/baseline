import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { logAuditAction } from '@/lib/auditLog';
import {
    previewAutoTransactionsMigration,
    runAutoTransactionsMigrationBatch,
} from '@/lib/migrations/migrateAutoTransactionsFromSeptember';

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

export async function GET() {
    try {
        const auth = await requireAccountant();
        if (!auth.ok) return auth.response;

        const db = await getDB();
        const preview = await previewAutoTransactionsMigration(db);
        return NextResponse.json({
            success: true,
            arrivalFrom: preview.arrivalFrom,
            matched: preview.matched,
            alreadyProcessed: preview.alreadyProcessed,
            eligible: preview.eligible,
        });
    } catch (error) {
        console.error('migrate-auto-transactions GET:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAccountant();
        if (!auth.ok) return auth.response;

        const body = await request.json().catch(() => ({}));
        const limit = typeof body.limit === 'number' ? body.limit : undefined;

        const db = await getDB();
        const accountantId = sessionUserId(auth.session.user);
        const stats = await runAutoTransactionsMigrationBatch(db, accountantId, limit);

        const su = auth.session.user as { name?: unknown };
        const userName = typeof su.name === 'string' ? su.name : 'Unknown';
        await logAuditAction({
            entity: 'other',
            action: 'create',
            userId: accountantId ?? '',
            userName,
            userRole: auth.userRole ?? '',
            description:
                `Миграция автотранзакций с ${stats.arrivalFrom}: броней ${stats.bookingsProcessed}, ` +
                `расходов ${stats.expensesCreated}, доходов ${stats.incomesCreated}, ` +
                `пропущено правил без привязки к брони ${stats.rulesSkipped}, осталось ${stats.remaining}`,
        });

        const message =
            stats.bookingsProcessed === 0
                ? 'Нет броней с заездом с сентября 2026, по которым автоучёт ещё не запускался.'
                : `Обработано броней: ${stats.bookingsProcessed}. Создано расходов: ${stats.expensesCreated}, доходов: ${stats.incomesCreated}.`;

        return NextResponse.json({
            success: stats.errors.length === 0 || stats.expensesCreated + stats.incomesCreated > 0 || stats.bookingsProcessed > 0,
            message,
            ...stats,
        });
    } catch (error) {
        console.error('migrate-auto-transactions POST:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
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

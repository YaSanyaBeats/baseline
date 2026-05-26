import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { logAuditAction } from '@/lib/auditLog';
import {
    RETAINED_REPORT_MONTH_FROM,
    runDeleteTransactionsBeforeReportMonth,
} from '@/lib/migrations/deleteTransactionsBeforeReportMonth';

async function assertMigrationAccess() {
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
                {
                    success: false,
                    message: 'Недостаточно прав. Миграция доступна только админу и бухгалтеру.',
                },
                { status: 403 },
            ),
        };
    }

    return { ok: true as const, session };
}

function formatStatsMessage(
    stats: Awaited<ReturnType<typeof runDeleteTransactionsBeforeReportMonth>>,
    dryRun: boolean,
) {
    const prefix = dryRun ? 'Предпросмотр' : 'Удаление выполнено';
    return (
        `${prefix}. Расходы: ${dryRun ? stats.expensesMatched : stats.expensesDeleted} ` +
        `${dryRun ? 'будет удалено' : 'удалено'} из ${stats.expensesMatched}; ` +
        `доходы: ${dryRun ? stats.incomesMatched : stats.incomesDeleted} ` +
        `${dryRun ? 'будет удалено' : 'удалено'} из ${stats.incomesMatched}. ` +
        `Сохраняются записи с месяцем отчёта ${RETAINED_REPORT_MONTH_FROM} и позже.`
    );
}

/**
 * GET — предпросмотр (сколько записей будет удалено).
 * POST — удаление транзакций с месяцем отчёта раньше декабря 2025.
 */
export async function GET() {
    try {
        const access = await assertMigrationAccess();
        if (!access.ok) return access.response;

        const db = await getDB();
        const stats = await runDeleteTransactionsBeforeReportMonth(db, { dryRun: true });

        return NextResponse.json({
            success: true,
            dryRun: true,
            message: formatStatsMessage(stats, true),
            stats,
        });
    } catch (error) {
        console.error('delete-transactions-before-report-month GET:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

export async function POST(_request: NextRequest) {
    try {
        const access = await assertMigrationAccess();
        if (!access.ok) return access.response;

        const db = await getDB();
        const stats = await runDeleteTransactionsBeforeReportMonth(db, { dryRun: false });

        const su = access.session.user as { _id?: unknown; name?: unknown; role?: string };
        const rawId = su._id;
        const userId =
            typeof rawId === 'string'
                ? rawId
                : typeof rawId === 'object' && rawId != null && 'toString' in rawId
                  ? String((rawId as { toString(): string }).toString())
                  : '';
        const rawName = su.name;
        const userName = typeof rawName === 'string' ? rawName : 'Unknown';

        await logAuditAction({
            entity: 'other',
            action: 'delete',
            userId,
            userName,
            userRole: su.role ?? '',
            description:
                `Миграция: удалены транзакции с месяцем отчёта до ${RETAINED_REPORT_MONTH_FROM}. ` +
                `Расходов: ${stats.expensesDeleted}, доходов: ${stats.incomesDeleted}.`,
            metadata: {
                retainedFrom: RETAINED_REPORT_MONTH_FROM,
                expensesDeleted: stats.expensesDeleted,
                incomesDeleted: stats.incomesDeleted,
            },
        });

        return NextResponse.json({
            success: true,
            dryRun: false,
            message: formatStatsMessage(stats, false),
            stats,
        });
    } catch (error) {
        console.error('delete-transactions-before-report-month POST:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

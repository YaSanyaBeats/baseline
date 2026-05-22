import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { runMigrateCategoryNamesToIds } from '@/lib/migrations/migrateCategoryNamesToIds';

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

    return { ok: true as const };
}

function formatStatsMessage(stats: Awaited<ReturnType<typeof runMigrateCategoryNamesToIds>>, dryRun: boolean) {
    const prefix = dryRun ? 'Предпросмотр' : 'Миграция выполнена';
    return (
        `${prefix}. Расходы: ${stats.expenses.updated} обновлено, ${stats.expenses.alreadyOk} уже с ID, ` +
        `${stats.expenses.skipped} пропущено из ${stats.expenses.scanned}; ` +
        `доходы: ${stats.incomes.updated}/${stats.incomes.alreadyOk}/${stats.incomes.skipped}/${stats.incomes.scanned}; ` +
        `правила автоучёта: ${stats.autoAccountingRules.updated}/${stats.autoAccountingRules.alreadyOk}/` +
        `${stats.autoAccountingRules.skipped}/${stats.autoAccountingRules.scanned}. ` +
        `Без соответствия: ${stats.unmatched.length}, неоднозначно: ${stats.ambiguous.length}.`
    );
}

/**
 * GET — предпросмотр миграции (dry run).
 * POST — выполнение миграции category → categoryId.
 */
export async function GET() {
    try {
        const access = await assertMigrationAccess();
        if (!access.ok) return access.response;

        const db = await getDB();
        const stats = await runMigrateCategoryNamesToIds(db, { dryRun: true });

        return NextResponse.json({
            success: true,
            dryRun: true,
            message: formatStatsMessage(stats, true),
            stats,
        });
    } catch (error) {
        console.error('migrate-category-ids GET:', error);
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
        const stats = await runMigrateCategoryNamesToIds(db, { dryRun: false });

        return NextResponse.json({
            success: true,
            dryRun: false,
            message: formatStatsMessage(stats, false),
            stats,
        });
    } catch (error) {
        console.error('migrate-category-ids POST:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

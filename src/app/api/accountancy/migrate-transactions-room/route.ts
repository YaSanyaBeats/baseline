import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { logAuditAction } from '@/lib/auditLog';
import { runMigrateTransactionsToRoom } from '@/lib/migrations/migrateTransactionsToRoom';

/**
 * Переносит транзакции за месяц отчёта из одной комнаты в другую (в рамках объекта).
 * Доступ: админ и бухгалтер.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'admin' && userRole !== 'accountant') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const reportMonthRaw = body.reportMonth;
        const reportMonth = typeof reportMonthRaw === 'string' ? reportMonthRaw.trim() : '';
        const objectIdRaw = body.objectId;
        const objectId =
            typeof objectIdRaw === 'number'
                ? objectIdRaw
                : typeof objectIdRaw === 'string'
                  ? Number(objectIdRaw)
                  : NaN;
        const sourceRoomName =
            typeof body.sourceRoomName === 'string' ? body.sourceRoomName.trim() : '';
        const destinationRoomName =
            typeof body.destinationRoomName === 'string' ? body.destinationRoomName.trim() : '';
        const onlyBookingLinked = body.onlyBookingLinked === true;

        if (!/^\d{4}-\d{2}$/.test(reportMonth)) {
            return NextResponse.json(
                { success: false, message: 'Укажите месяц отчёта в формате YYYY-MM' },
                { status: 400 },
            );
        }

        if (!Number.isFinite(objectId)) {
            return NextResponse.json(
                { success: false, message: 'Укажите объект' },
                { status: 400 },
            );
        }

        if (!sourceRoomName) {
            return NextResponse.json(
                { success: false, message: 'Укажите исходную комнату' },
                { status: 400 },
            );
        }

        if (!destinationRoomName) {
            return NextResponse.json(
                { success: false, message: 'Укажите комнату назначения' },
                { status: 400 },
            );
        }

        if (sourceRoomName === destinationRoomName) {
            return NextResponse.json(
                { success: false, message: 'Исходная комната и комната назначения должны отличаться' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const stats = await runMigrateTransactionsToRoom(db, {
            reportMonth,
            objectId,
            sourceRoomName,
            destinationRoomName,
            onlyBookingLinked,
        });

        const totalUpdated = stats.expensesUpdated + stats.incomesUpdated;

        const su = session.user as { _id?: unknown; name?: unknown };
        const rawId = su._id;
        const userId =
            typeof rawId === 'string'
                ? rawId
                : typeof rawId === 'object' && rawId != null && 'toString' in rawId
                  ? String((rawId as { toString(): string }).toString())
                  : '';
        const rawName = su.name ?? session.user.name;
        const userName = typeof rawName === 'string' ? rawName : 'Unknown';

        await logAuditAction({
            entity: 'other',
            action: 'update',
            userId,
            userName,
            userRole: userRole ?? '',
            description: `Миграция транзакций за ${reportMonth}: «${sourceRoomName}» → «${destinationRoomName}» (объект ${objectId}${onlyBookingLinked ? ', только с бронями' : ''}): расходов ${stats.expensesUpdated}, доходов ${stats.incomesUpdated}`,
            metadata: {
                objectId,
            },
        });

        return NextResponse.json({
            success: true,
            message: `Обновлено транзакций: ${totalUpdated} (расходов: ${stats.expensesUpdated}, доходов: ${stats.incomesUpdated})`,
            ...stats,
            modifiedCount: totalUpdated,
        });
    } catch (error) {
        console.error('migrate-transactions-room:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

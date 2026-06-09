import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { logAuditAction } from '@/lib/auditLog';
import { RenameRoomError, runRenameRoom } from '@/lib/server/renameRoom';

/**
 * Переименование комнаты в objects/internalObjects и во всех связанных коллекциях.
 * Доступ: только admin.
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
        if (userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const objectIdRaw = body.objectId;
        const objectId =
            typeof objectIdRaw === 'number'
                ? objectIdRaw
                : typeof objectIdRaw === 'string'
                  ? Number(objectIdRaw)
                  : NaN;
        const oldRoomName =
            typeof body.oldRoomName === 'string' ? body.oldRoomName.trim() : '';
        const newRoomName =
            typeof body.newRoomName === 'string' ? body.newRoomName.trim() : '';

        const db = await getDB();
        const stats = await runRenameRoom(db, { objectId, oldRoomName, newRoomName });

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

        const totalUpdated =
            stats.expensesUpdated +
            stats.incomesUpdated +
            stats.objectRoomMetadataRoomsUpdated +
            stats.autoAccountingRulesUpdated +
            stats.accountancyClosedMonthsUpdated +
            stats.holyCowExpenseShareRatesUpdated +
            stats.usersUpdated;

        await logAuditAction({
            entity: 'other',
            action: 'update',
            userId,
            userName,
            userRole: userRole ?? '',
            description: `Переименование комнаты «${oldRoomName}» → «${newRoomName}» (объект ${objectId}): обновлено записей ${totalUpdated}`,
            metadata: { objectId },
        });

        return NextResponse.json({
            success: true,
            message: `Комната переименована. Обновлено связанных записей: ${totalUpdated}`,
            ...stats,
        });
    } catch (error) {
        if (error instanceof RenameRoomError) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }
        console.error('POST /api/options/rename-room:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

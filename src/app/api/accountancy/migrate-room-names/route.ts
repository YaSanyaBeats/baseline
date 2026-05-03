import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { runMigrateRoomIdsToNames } from '@/lib/migrations/migrateRoomIdsToNames';

/**
 * Переводит привязки к комнатам с unit id на имя юнита в коллекциях:
 * expenses, incomes, objectRoomMetadata_rooms, autoAccountingRules, users.
 * Справочник объектов: коллекции **internalObjects** (отрицательные id) и **objects** (Beds24).
 * objectRoomMetadata_objects не меняется (нет полей комнаты).
 */
export async function POST() {
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
                { success: false, message: 'Недостаточно прав. Миграция доступна только админу и бухгалтеру.' },
                { status: 403 },
            );
        }

        const db = await getDB();
        const stats = await runMigrateRoomIdsToNames(db);

        const message =
            `Готово. Расходы: обновлено ${stats.expenses.updated} из ${stats.expenses.scanned}; ` +
            `доходы: ${stats.incomes.updated}/${stats.incomes.scanned}; ` +
            `метаданные комнат: ${stats.objectRoomMetadataRooms.updated}/${stats.objectRoomMetadataRooms.scanned}; ` +
            `правила автоучёта: ${stats.autoAccountingRules.updated}/${stats.autoAccountingRules.scanned}; ` +
            `пользователи: ${stats.users.updated}/${stats.users.scanned}.`;

        return NextResponse.json({
            success: true,
            message,
            stats,
        });
    } catch (error) {
        console.error('migrate-room-names:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

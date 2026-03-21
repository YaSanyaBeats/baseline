import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { migratePropertyObjectIdsToRoomTypeIds } from '@/lib/migrations/migratePropertyObjectIdsToRoomTypeIds';

/**
 * POST /api/admin/migrate-property-to-roomtype
 * Одноразовая миграция: привязки с ID property → id первого roomTypes[0] в коллекции objects.
 * Только admin. Body: { dryRun?: boolean }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
        }
        const role = (session.user as { role?: string }).role;
        if (role !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Доступно только администратору' },
                { status: 403 }
            );
        }

        let body: { dryRun?: boolean } = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const db = await getDB();
        const result = await migratePropertyObjectIdsToRoomTypeIds(db, {
            dryRun: Boolean(body.dryRun),
        });

        return NextResponse.json({
            success: true,
            message: body.dryRun
                ? 'Пробный прогон: изменения в БД не применялись'
                : 'Миграция выполнена',
            result,
        });
    } catch (error) {
        console.error('migrate-property-to-roomtype:', error);
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Ошибка миграции' },
            { status: 500 }
        );
    }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import {
    previewMigrateMetadataPropertyIds,
    runMigrateMetadataPropertyIds,
} from '@/lib/migrations/migrateMetadataPropertyIds';

/**
 * GET — предпросмотр неоднозначных objectId в objectRoomMetadata_*.
 * POST — миграция: roomType.id → propertyId, слияние дубликатов.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
        }
        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'admin' && userRole !== 'accountant') {
            return NextResponse.json({ success: false, message: 'Недостаточно прав' }, { status: 403 });
        }

        const db = await getDB();
        const preview = await previewMigrateMetadataPropertyIds(db);
        return NextResponse.json({ success: true, preview });
    } catch (error) {
        console.error('migrate-metadata-property-ids GET:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
        }
        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'admin' && userRole !== 'accountant') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Миграция доступна только админу и бухгалтеру.' },
                { status: 403 },
            );
        }

        const db = await getDB();
        const stats = await runMigrateMetadataPropertyIds(db);

        const message =
            `Готово. Метаданные объектов: неоднозначных ${stats.objectMetadata.ambiguous}, ` +
            `слито ${stats.objectMetadata.merged}, переключено ${stats.objectMetadata.rekeyed}, ` +
            `удалено дублей ${stats.objectMetadata.deleted}. ` +
            `Метаданные комнат: неоднозначных ${stats.roomMetadata.ambiguous}, ` +
            `слито ${stats.roomMetadata.merged}, переключено ${stats.roomMetadata.rekeyed}, ` +
            `удалено дублей ${stats.roomMetadata.deleted}.`;

        return NextResponse.json({ success: true, message, stats });
    } catch (error) {
        console.error('migrate-metadata-property-ids POST:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

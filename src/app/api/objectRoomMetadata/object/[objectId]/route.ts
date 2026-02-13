import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { upsertObjectMetadata } from '@/lib/server/objectRoomMetadata';
import type { ObjectType } from '@/lib/types';

/**
 * PUT /api/objectRoomMetadata/object/[objectId]
 * Обновляет метаданные объекта (район, тип).
 * Доступ: только администраторы.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ objectId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Только администратор может редактировать объекты.' },
                { status: 403 }
            );
        }

        const { objectId } = await params;
        const objectIdNum = parseInt(objectId, 10);
        if (Number.isNaN(objectIdNum)) {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID объекта' },
                { status: 400 }
            );
        }

        const body = await request.json();
        const district = typeof body.district === 'string' ? body.district.trim() : undefined;
        const objectType = body.objectType;
        const validTypes: ObjectType[] = ['apartments', 'villa'];
        if (objectType !== undefined && !validTypes.includes(objectType)) {
            return NextResponse.json(
                { success: false, message: 'Тип объекта должен быть apartments или villa' },
                { status: 400 }
            );
        }

        await upsertObjectMetadata(objectIdNum, { district, objectType });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in PUT /api/objectRoomMetadata/object/[objectId]:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

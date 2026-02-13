import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllObjectMetadata, getAllRoomMetadata } from '@/lib/server/objectRoomMetadata';

/**
 * GET /api/objectRoomMetadata
 * Возвращает все метаданные объектов и комнат.
 * Доступ: авторизованные пользователи (для слияния с objects на клиенте).
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        const [objects, rooms] = await Promise.all([
            getAllObjectMetadata(),
            getAllRoomMetadata(),
        ]);

        return NextResponse.json({ objects, rooms });
    } catch (error) {
        console.error('Error in GET /api/objectRoomMetadata:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

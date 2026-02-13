import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { upsertRoomMetadata } from '@/lib/server/objectRoomMetadata';
import type { RoomLevel } from '@/lib/types';
import type { CommissionSchemeId } from '@/lib/commissionCalculation';

/**
 * PUT /api/objectRoomMetadata/room/[objectId]/[roomId]
 * Обновляет метаданные комнаты.
 * Доступ: только администраторы.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ objectId: string; roomId: string }> }
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
                { success: false, message: 'Недостаточно прав. Только администратор может редактировать комнаты.' },
                { status: 403 }
            );
        }

        const { objectId, roomId } = await params;
        const objectIdNum = parseInt(objectId, 10);
        const roomIdNum = parseInt(roomId, 10);
        if (Number.isNaN(objectIdNum) || Number.isNaN(roomIdNum)) {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID объекта или комнаты' },
                { status: 400 }
            );
        }

        const body = await request.json();
        const validLevels: RoomLevel[] = ['economy', 'comfort', 'premium', 'lux'];
        const validKitchen = ['yes', 'no'];
        const validSchemes: CommissionSchemeId[] = [1, 2, 3, 4];

        const data: Record<string, unknown> = {};
        if (body.bedrooms !== undefined) {
            const v = Number(body.bedrooms);
            if (!Number.isInteger(v) || v < 0) {
                return NextResponse.json(
                    { success: false, message: 'Спален должно быть неотрицательным целым числом' },
                    { status: 400 }
                );
            }
            data.bedrooms = v;
        }
        if (body.bathrooms !== undefined) {
            const v = Number(body.bathrooms);
            if (!Number.isInteger(v) || v < 0) {
                return NextResponse.json(
                    { success: false, message: 'Ванных комнат должно быть неотрицательным целым числом' },
                    { status: 400 }
                );
            }
            data.bathrooms = v;
        }
        if (body.livingRoomSofas !== undefined) {
            const v = Number(body.livingRoomSofas);
            if (!Number.isInteger(v) || v < 0) {
                return NextResponse.json(
                    { success: false, message: 'Диванов в гостиной должно быть неотрицательным целым числом' },
                    { status: 400 }
                );
            }
            data.livingRoomSofas = v;
        }
        if (body.kitchen !== undefined) {
            if (!validKitchen.includes(body.kitchen)) {
                return NextResponse.json(
                    { success: false, message: 'Кухня должна быть yes или no' },
                    { status: 400 }
                );
            }
            data.kitchen = body.kitchen;
        }
        if (body.level !== undefined) {
            if (!validLevels.includes(body.level)) {
                return NextResponse.json(
                    { success: false, message: 'Уровень должен быть economy, comfort, premium или lux' },
                    { status: 400 }
                );
            }
            data.level = body.level;
        }
        if (body.commissionSchemeId !== undefined) {
            const v = Number(body.commissionSchemeId);
            if (!validSchemes.includes(v as CommissionSchemeId)) {
                return NextResponse.json(
                    { success: false, message: 'Схема комиссии должна быть 1, 2, 3 или 4' },
                    { status: 400 }
                );
            }
            data.commissionSchemeId = v;
        }

        await upsertRoomMetadata(objectIdNum, roomIdNum, data as any);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in PUT /api/objectRoomMetadata/room/[objectId]/[roomId]:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

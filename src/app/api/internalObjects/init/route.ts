import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { initializeInternalObjects } from '@/lib/server/internalObjects';

/**
 * API для инициализации внутренних объектов (HolyCowPhuket внутренний объект и филиалы).
 * Идемпотентный: можно вызывать многократно, дубликаты не создаются.
 * Доступ: только для администраторов.
 */
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        const userRole = (session.user as any).role;
        if (userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Только администратор может инициализировать внутренние объекты.' },
                { status: 403 }
            );
        }

        const result = await initializeInternalObjects();

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in POST /api/internalObjects/init:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

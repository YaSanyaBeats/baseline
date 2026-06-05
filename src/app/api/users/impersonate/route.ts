import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { createImpersonationToken } from '@/lib/impersonation';

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
        }

        const sessionUser = session.user as { role?: string; login?: string; id?: string };
        if (sessionUser.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'Недостаточно прав' }, { status: 403 });
        }

        if (session.impersonatedBy) {
            return NextResponse.json(
                { success: false, message: 'Сначала вернитесь в свой аккаунт' },
                { status: 400 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
        if (!userId) {
            return NextResponse.json({ success: false, message: 'userId обязателен' }, { status: 400 });
        }

        let targetOid: ObjectId;
        try {
            targetOid = new ObjectId(userId);
        } catch {
            return NextResponse.json({ success: false, message: 'Некорректный userId' }, { status: 400 });
        }

        const db = await getDB();
        const target = await db.collection('users').findOne({
            _id: targetOid,
            role: 'owner',
        });

        if (!target) {
            return NextResponse.json(
                { success: false, message: 'Владелец не найден' },
                { status: 404 }
            );
        }

        const adminLogin = sessionUser.login ?? sessionUser.id;
        if (!adminLogin) {
            return NextResponse.json({ success: false, message: 'Логин администратора не найден' }, { status: 400 });
        }

        const impersonationToken = createImpersonationToken(adminLogin, userId);
        if (!impersonationToken) {
            return NextResponse.json(
                { success: false, message: 'Не удалось создать токен' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, impersonationToken });
    } catch (error) {
        console.error('Error in POST /api/users/impersonate:', error);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}

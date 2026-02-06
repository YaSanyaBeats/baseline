import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import bcrypt from 'bcrypt';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logAuditAction } from '@/lib/auditLog';

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const db = await getDB();
        const usersCollection = db.collection('users');
        
        const body = await request.json();
        const user = body.params?.user || body.user;
        
        if (user && user.login && user.password) {
            const hashedPassword = await bcrypt.hash(user.password, 10);
            const newUser = {
                ...user,
                password: hashedPassword
            };
            
            const result = await usersCollection.insertOne(newUser);

            // Логируем создание пользователя
            const userId = (session.user as any)._id;
            const userName = (session.user as any).name || session.user.name || 'Unknown';
            const userRole = (session.user as any).role || 'unknown';
            const userDataForLog = { ...newUser };
            delete userDataForLog.password; // Не сохраняем пароль в логах
            
            await logAuditAction({
                entity: 'user',
                entityId: result.insertedId.toString(),
                action: 'create',
                userId,
                userName,
                userRole,
                description: `Создан новый пользователь: ${user.login} (${user.name})`,
                newData: userDataForLog,
            });
            
            return NextResponse.json({
                success: true,
                message: 'Новый пользователь успешно добавлен'
            });
        }
        
        return NextResponse.json({
            success: false,
            message: 'Одно или несколько полей невалидны'
        }, { status: 400 });
    } catch (error) {
        console.error('Error in POST /api/users/addUser:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

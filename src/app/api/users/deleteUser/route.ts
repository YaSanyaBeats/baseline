import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logAuditAction } from '@/lib/auditLog';

export async function DELETE(request: NextRequest) {
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
        
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');
        
        if (id) {
            // Получаем данные пользователя перед удалением
            const existingUser = await usersCollection.findOne({ _id: new ObjectId(id) });
            
            await usersCollection.deleteOne({
                _id: new ObjectId(id)
            });

            // Логируем удаление пользователя
            if (existingUser) {
                const userId = (session.user as any)._id;
                const userName = (session.user as any).name || session.user.name || 'Unknown';
                const userRole = (session.user as any).role || 'unknown';
                
                await logAuditAction({
                    entity: 'user',
                    entityId: id,
                    action: 'delete',
                    userId,
                    userName,
                    userRole,
                    description: `Удалён пользователь: ${existingUser.login} (${existingUser.name})`,
                    oldData: existingUser,
                });
            }
            
            return NextResponse.json({
                success: true,
                message: 'Пользователь успешно удалён'
            });
        }
        
        return NextResponse.json({
            success: false,
            message: 'Произошла ошибка'
        }, { status: 400 });
    } catch (error) {
        console.error('Error in DELETE /api/users/deleteUser:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = await getDB();
        const collection = db.collection('users');
        
        // Получаем login из сессии
        // login может быть в session.user.login, session.user.id или в session.user.user.login
        const sessionUser = session.user as any;
        const login = sessionUser.login || sessionUser.id || sessionUser.user?.login;
        
        if (!login) {
            return NextResponse.json({ error: 'User login not found' }, { status: 400 });
        }

        const user = await collection.findOne({ login });
        
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Возвращаем данные пользователя без пароля
        return NextResponse.json({
            _id: user._id,
            login: user.login,
            name: user.name,
            role: user.role,
            objects: user.objects,
            email: user.email,
            phone: user.phone,
            bankName: user.bankName,
            accountNumber: user.accountNumber,
            accountType: user.accountType,
            reportLink: user.reportLink
        });
    } catch (error) {
        console.error('Error in GET /api/user/me:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

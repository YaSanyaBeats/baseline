import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import bcrypt from 'bcrypt';

export async function POST(request: NextRequest) {
    try {
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
            
            await usersCollection.insertOne(newUser);
            
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

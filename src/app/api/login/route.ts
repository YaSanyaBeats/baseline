import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDB } from '@/lib/db/getDB';

export async function POST(request: NextRequest) {
    try {
        const secret_key = process.env.SECRET_KEY;
        if (!secret_key) {
            return NextResponse.json({ error: 'SECRET_KEY не определен в переменных окружения' }, { status: 500 });
        }
        
        const db = await getDB();
        const { login, password } = await request.json();
        
        const collection = db.collection('users');
        const user = await collection.findOne({ login });
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            return NextResponse.json({ error: 'Неверные данные' }, { status: 401 });
        }
        
        const token = jwt.sign({ id: user?.id }, secret_key, { expiresIn: '1h' });
        
        return NextResponse.json({
            user: {
                _id: user._id,
                login: user.login,
                name: user.name,
                role: user.role,
                objects: user.objects,
                accountType: user.accountType
            },
            token
        });
    } catch (error) {
        console.error('Error in POST /api/login:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

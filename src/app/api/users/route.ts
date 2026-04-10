import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
    try {
        const db = await getDB();
        const collection = db.collection('users');
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');
        const hasCashflowOnly = searchParams.get('hasCashflow') === 'true';

        if (hasCashflowOnly) {
            const session = await getServerSession(authOptions);
            if (!session?.user) {
                return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
            }
            const userRole = (session.user as any).role;
            const hasCashflow = Boolean((session.user as any).hasCashflow);
            const canAccess = userRole === 'admin' || userRole === 'accountant' || hasCashflow;
            if (!canAccess) {
                return NextResponse.json({ success: false, message: 'Недостаточно прав' }, { status: 403 });
            }
            const users = await collection
                .find({ hasCashflow: true }, { projection: { _id: 1, name: 1 } })
                .toArray();
            return NextResponse.json(users);
        }

        if (id) {
            const user = await collection.findOne({
                _id: new ObjectId(id)
            });
            if (user) {
                return NextResponse.json(user);
            }
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const users = await collection.find().toArray();
        return NextResponse.json(users);
    } catch (error) {
        console.error('Error in GET /api/users:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

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
        console.error('Error in POST /api/users:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

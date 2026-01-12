import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';

export async function DELETE(request: NextRequest) {
    try {
        const db = await getDB();
        const usersCollection = db.collection('users');
        
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');
        
        if (id) {
            await usersCollection.deleteOne({
                _id: new ObjectId(id)
            });
            
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

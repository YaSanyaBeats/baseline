import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
    try {
        const db = await getDB();
        const usersCollection = db.collection('users');
        
        const body = await request.json();
        const user = body.params?.user || body.user;
        
        if (user && user.login) {
            const updateData: any = {
                name: user.name,
                login: user.login,
                role: user.role,
                objects: user.objects
            };
            
            if (user.password) {
                updateData.password = await bcrypt.hash(user.password, 10);
            }
            
            // Добавляем новые поля, если они присутствуют
            if (user.email !== undefined) {
                updateData.email = user.email;
            }
            if (user.phone !== undefined) {
                updateData.phone = user.phone;
            }
            if (user.bankName !== undefined) {
                updateData.bankName = user.bankName;
            }
            if (user.accountNumber !== undefined) {
                updateData.accountNumber = user.accountNumber;
            }
            if (user.accountType !== undefined) {
                updateData.accountType = user.accountType;
            }
            if (user.reportLink !== undefined) {
                updateData.reportLink = user.reportLink;
            }
            
            await usersCollection.updateOne(
                { _id: new ObjectId(user._id as string) },
                { $set: updateData }
            );
            
            return NextResponse.json({
                success: true,
                message: 'Пользователь успешно изменён'
            });
        }
        
        return NextResponse.json({
            success: false,
            message: 'Одно или несколько полей невалидны'
        }, { status: 400 });
    } catch (error) {
        console.error('Error in POST /api/users/editUser:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

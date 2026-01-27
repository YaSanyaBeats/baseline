import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';

export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as any).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Только бухгалтер или администратор могут удалять доходы.' },
                { status: 403 },
            );
        }

        const db = await getDB();
        const incomesCollection = db.collection('incomes');

        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID дохода не указан' },
                { status: 400 },
            );
        }

        let existingIncome;
        try {
            existingIncome = await incomesCollection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID дохода' },
                { status: 400 },
            );
        }
        if (!existingIncome) {
            return NextResponse.json(
                { success: false, message: 'Доход не найден' },
                { status: 404 },
            );
        }

        await incomesCollection.deleteOne({ _id: new ObjectId(id) });

        return NextResponse.json({
            success: true,
            message: 'Доход успешно удалён',
        });
    } catch (error) {
        console.error('Error in DELETE /api/incomes/deleteIncome:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}


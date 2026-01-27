import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { Income } from '@/lib/types';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
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
                { success: false, message: 'Недостаточно прав. Только бухгалтер или администратор могут редактировать доходы.' },
                { status: 403 },
            );
        }

        const db = await getDB();
        const body = await request.json();
        const incomeData: Income = body.params?.income || body.income;

        if (
            !incomeData ||
            !incomeData._id ||
            typeof incomeData.objectId !== 'number' ||
            !incomeData.category ||
            typeof incomeData.amount !== 'number' ||
            !incomeData.date
        ) {
            return NextResponse.json(
                { success: false, message: 'Не все обязательные поля заполнены' },
                { status: 400 },
            );
        }

        if (incomeData.amount <= 0) {
            return NextResponse.json(
                { success: false, message: 'Сумма должна быть больше нуля' },
                { status: 400 },
            );
        }

        const incomesCollection = db.collection('incomes');

        let existingIncome;
        try {
            existingIncome = await incomesCollection.findOne({ _id: new ObjectId(incomeData._id) });
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

        const updateData: any = {
            objectId: incomeData.objectId,
            bookingId: incomeData.bookingId ?? null,
            category: incomeData.category,
            amount: incomeData.amount,
            date: new Date(incomeData.date),
        };

        await incomesCollection.updateOne(
            { _id: new ObjectId(incomeData._id) },
            { $set: updateData },
        );

        return NextResponse.json({
            success: true,
            message: 'Доход успешно обновлён',
        });
    } catch (error) {
        console.error('Error in POST /api/incomes/editIncome:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}


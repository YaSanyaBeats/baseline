import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { Income } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const db = await getDB();
        const incomesCollection = db.collection('incomes');

        const incomes = await incomesCollection
            .find({})
            .sort({ date: -1, createdAt: -1 })
            .toArray();

        return NextResponse.json(incomes);
    } catch (error) {
        console.error('Error in GET /api/incomes:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

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
                { success: false, message: 'Недостаточно прав. Только бухгалтер или администратор могут добавлять доходы.' },
                { status: 403 },
            );
        }

        const db = await getDB();
        const body = await request.json();
        const incomeData: Income = body.params?.income || body.income;

        if (
            !incomeData ||
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

        const accountantId = (session.user as any)._id;

        const usersCollection = db.collection('users');
        let accountant;
        try {
            accountant = await usersCollection.findOne({ _id: new ObjectId(accountantId) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID бухгалтера' },
                { status: 400 },
            );
        }
        if (!accountant) {
            return NextResponse.json(
                { success: false, message: 'Пользователь-бухгалтер не найден' },
                { status: 404 },
            );
        }

        const incomesCollection = db.collection('incomes');

        const incomeToInsert = {
            objectId: incomeData.objectId,
            bookingId: incomeData.bookingId ?? null,
            category: incomeData.category,
            amount: incomeData.amount,
            date: new Date(incomeData.date),
            attachments: incomeData.attachments ?? [],
            accountantId,
            accountantName: accountant.name,
            createdAt: new Date(),
        };

        const result = await incomesCollection.insertOne(incomeToInsert as any);

        // Логируем создание дохода
        await logAuditAction({
            entity: 'income',
            entityId: result.insertedId.toString(),
            action: 'create',
            userId: accountantId,
            userName: accountant.name,
            userRole: userRole,
            description: `Создан доход: ${incomeData.category}, сумма ${incomeData.amount}`,
            newData: incomeToInsert,
            metadata: {
                objectId: incomeData.objectId,
                bookingId: incomeData.bookingId,
                category: incomeData.category,
                amount: incomeData.amount,
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Доход успешно добавлен',
        });
    } catch (error) {
        console.error('Error in POST /api/incomes:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}


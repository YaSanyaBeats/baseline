import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { Income, IncomeStatus } from '@/lib/types';
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

        const userRole = (session.user as any).role;
        const hasCashflow = Boolean((session.user as any).hasCashflow);
        const userId = (session.user as any)._id?.toString?.() ?? (session.user as any)._id;

        const db = await getDB();
        const incomesCollection = db.collection('incomes');

        const filter: Record<string, unknown> = {};
        if (userRole !== 'admin' && userRole !== 'accountant') {
            if (hasCashflow && userId) {
                const userPrefix = `user:${userId}`;
                filter.$or = [
                    { source: userPrefix },
                    { recipient: userPrefix },
                ];
            } else {
                return NextResponse.json(
                    { success: false, message: 'Недостаточно прав' },
                    { status: 403 },
                );
            }
        }

        const incomes = await incomesCollection
            .find(filter)
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
        const hasCashflow = Boolean((session.user as any).hasCashflow);
        const canCreate = userRole === 'accountant' || userRole === 'admin' || hasCashflow;
        if (!canCreate) {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав для добавления доходов.' },
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
                { success: false, message: 'Стоимость должна быть больше нуля' },
                { status: 400 },
            );
        }

        const quantity = incomeData.quantity != null && Number.isInteger(incomeData.quantity) && incomeData.quantity >= 1
            ? incomeData.quantity
            : 1;

        const onlyDraftForCashflow = hasCashflow && userRole !== 'admin' && userRole !== 'accountant';
        const allowedStatuses: IncomeStatus[] = ['draft', 'confirmed'];
        const status = onlyDraftForCashflow
            ? 'draft'
            : (incomeData.status && allowedStatuses.includes(incomeData.status)
                ? incomeData.status
                : 'draft');

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
            roomId: incomeData.roomId ?? null,
            bookingId: incomeData.bookingId ?? null,
            source: incomeData.source ?? null,
            recipient: incomeData.recipient ?? null,
            cashflowId: incomeData.cashflowId ?? null,
            category: incomeData.category,
            amount: incomeData.amount,
            quantity,
            date: new Date(incomeData.date),
            comment: incomeData.comment ?? '',
            reportMonth: incomeData.reportMonth ?? null,
            status,
            attachments: incomeData.attachments ?? [],
            accountantId,
            accountantName: accountant.name,
            createdAt: new Date(),
            autoCreated: incomeData.autoCreated ?? null,
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
            description: `Создан доход: ${incomeData.category}, сумма ${quantity * incomeData.amount}`,
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


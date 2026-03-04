import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { Expense, ExpenseStatus } from '@/lib/types';
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
        const expensesCollection = db.collection('expenses');

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

        const expenses = await expensesCollection
            .find(filter)
            .sort({ date: -1, createdAt: -1 })
            .toArray();

        return NextResponse.json(expenses);
    } catch (error) {
        console.error('Error in GET /api/expenses:', error);
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
                { success: false, message: 'Недостаточно прав для добавления расходов.' },
                { status: 403 },
            );
        }

        const db = await getDB();
        const body = await request.json();
        const expenseData: Expense = body.params?.expense || body.expense;

        if (
            !expenseData ||
            typeof expenseData.objectId !== 'number' ||
            !expenseData.category ||
            typeof expenseData.amount !== 'number' ||
            !expenseData.date ||
            !expenseData.status
        ) {
            return NextResponse.json(
                { success: false, message: 'Не все обязательные поля заполнены' },
                { status: 400 },
            );
        }

        if (expenseData.amount <= 0) {
            return NextResponse.json(
                { success: false, message: 'Стоимость должна быть больше нуля' },
                { status: 400 },
            );
        }

        const quantity = expenseData.quantity != null && Number.isInteger(expenseData.quantity) && expenseData.quantity >= 1
            ? expenseData.quantity
            : 1;

        const onlyDraftForCashflow = hasCashflow && userRole !== 'admin' && userRole !== 'accountant';
        if (onlyDraftForCashflow) {
            expenseData.status = 'draft';
        }

        const allowedStatuses: ExpenseStatus[] = ['draft', 'confirmed'];
        if (!allowedStatuses.includes(expenseData.status)) {
            return NextResponse.json(
                { success: false, message: 'Некорректный статус расхода' },
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

        const expensesCollection = db.collection('expenses');

        const expenseToInsert = {
            objectId: expenseData.objectId,
            roomId: expenseData.roomId ?? null,
            bookingId: expenseData.bookingId ?? null,
            counterpartyId: expenseData.counterpartyId ?? null,
            source: expenseData.source ?? null,
            recipient: expenseData.recipient ?? null,
            cashflowId: expenseData.cashflowId ?? null,
            category: expenseData.category,
            amount: expenseData.amount,
            quantity,
            date: new Date(expenseData.date),
            comment: expenseData.comment || '',
            reportMonth: expenseData.reportMonth || null,
            status: expenseData.status,
            attachments: expenseData.attachments ?? [],
            accountantId,
            accountantName: accountant.name,
            createdAt: new Date(),
            autoCreated: expenseData.autoCreated ?? null,
        };

        const result = await expensesCollection.insertOne(expenseToInsert as any);

        // Логируем создание расхода
        await logAuditAction({
            entity: 'expense',
            entityId: result.insertedId.toString(),
            action: 'create',
            userId: accountantId,
            userName: accountant.name,
            userRole: userRole,
            description: `Создан расход: ${expenseData.category}, сумма ${quantity * expenseData.amount}`,
            newData: expenseToInsert,
            metadata: {
                objectId: expenseData.objectId,
                bookingId: expenseData.bookingId,
                category: expenseData.category,
                amount: expenseData.amount,
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Расход успешно добавлен',
        });
    } catch (error) {
        console.error('Error in POST /api/expenses:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}


import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { Expense, ExpenseStatus } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';

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
                { success: false, message: 'Недостаточно прав. Только бухгалтер или администратор могут редактировать расходы.' },
                { status: 403 },
            );
        }

        const db = await getDB();
        const body = await request.json();
        const expenseData: Expense = body.params?.expense || body.expense;

        if (
            !expenseData ||
            !expenseData._id ||
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
                { success: false, message: 'Сумма должна быть больше нуля' },
                { status: 400 },
            );
        }

        const allowedStatuses: ExpenseStatus[] = ['draft', 'confirmed'];
        if (!allowedStatuses.includes(expenseData.status)) {
            return NextResponse.json(
                { success: false, message: 'Некорректный статус расхода' },
                { status: 400 },
            );
        }

        const expensesCollection = db.collection('expenses');

        let existingExpense;
        try {
            existingExpense = await expensesCollection.findOne({ _id: new ObjectId(expenseData._id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID расхода' },
                { status: 400 },
            );
        }
        if (!existingExpense) {
            return NextResponse.json(
                { success: false, message: 'Расход не найден' },
                { status: 404 },
            );
        }

        const updateData: any = {
            objectId: expenseData.objectId,
            bookingId: expenseData.bookingId ?? null,
            category: expenseData.category,
            amount: expenseData.amount,
            date: new Date(expenseData.date),
            comment: expenseData.comment || '',
            status: expenseData.status,
            attachments: expenseData.attachments ?? [],
        };

        await expensesCollection.updateOne(
            { _id: new ObjectId(expenseData._id) },
            { $set: updateData },
        );

        // Логируем обновление расхода
        const userId = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'expense',
            entityId: expenseData._id,
            action: 'update',
            userId,
            userName,
            userRole,
            description: `Обновлён расход: ${expenseData.category}, сумма ${expenseData.amount}`,
            oldData: existingExpense,
            newData: updateData,
            metadata: {
                objectId: expenseData.objectId,
                bookingId: expenseData.bookingId,
                category: expenseData.category,
                amount: expenseData.amount,
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Расход успешно обновлён',
        });
    } catch (error) {
        console.error('Error in POST /api/expenses/editExpense:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}


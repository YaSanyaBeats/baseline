import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { Expense, ExpenseStatus } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';
import { hasDuplicateForForbidCategory } from '@/lib/accountancyDuplicateGuard';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { mergeAccountancyListQuery } from '@/lib/accountancyListServerFilter';

export async function GET(request: NextRequest) {
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

        const baseFilter: Record<string, unknown> = {};
        if (userRole !== 'admin' && userRole !== 'accountant') {
            if (hasCashflow && userId) {
                const userPrefix = `user:${userId}`;
                baseFilter.$or = [
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

        const filter = mergeAccountancyListQuery(baseFilter, request.nextUrl.searchParams);

        const expenses = await expensesCollection
            .find(filter)
            .sort({ date: -1, createdAt: -1 })
            .toArray();

        const serialized = expenses.map((doc) => ({
            ...doc,
            _id: normalizeMongoIdString(doc._id),
        }));

        return NextResponse.json(serialized, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                Pragma: 'no-cache',
            },
        });
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

        if (expenseData.amount < 0) {
            return NextResponse.json(
                { success: false, message: 'Стоимость не может быть отрицательной' },
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

        if (
            await hasDuplicateForForbidCategory(db, 'expenses', 'expense', {
                objectId: expenseData.objectId,
                category: expenseData.category,
                roomId: expenseData.roomId ?? null,
                reportMonth: expenseData.reportMonth,
            })
        ) {
            return NextResponse.json(
                {
                    success: false,
                    code: 'FORBID_DUPLICATES',
                    message:
                        'Для этой категории включён запрет дублей: уже есть запись с тем же объектом, комнатой, категорией и отчётным месяцем.',
                },
                { status: 400 },
            );
        }

        const expensesCollection = db.collection('expenses');
        const incomesCollection = db.collection('incomes');

        const parentExpenseIdRaw =
            expenseData.parentExpenseId != null && String(expenseData.parentExpenseId).trim() !== ''
                ? String(expenseData.parentExpenseId).trim()
                : null;
        const parentIncomeIdRaw =
            expenseData.parentIncomeId != null && String(expenseData.parentIncomeId).trim() !== ''
                ? String(expenseData.parentIncomeId).trim()
                : null;

        if (parentExpenseIdRaw && parentIncomeIdRaw) {
            return NextResponse.json(
                { success: false, message: 'Укажите только один родитель: расход или доход' },
                { status: 400 },
            );
        }

        let parentExpenseIdBin: ObjectId | null = null;
        let parentIncomeIdBin: ObjectId | null = null;

        if (parentExpenseIdRaw) {
            let parentOid: ObjectId;
            try {
                parentOid = new ObjectId(parentExpenseIdRaw);
            } catch {
                return NextResponse.json(
                    { success: false, message: 'Некорректный ID родительского расхода' },
                    { status: 400 },
                );
            }
            const parentDoc = await expensesCollection.findOne({ _id: parentOid, recordType: 'expense' });
            if (!parentDoc) {
                return NextResponse.json(
                    { success: false, message: 'Родительский расход не найден' },
                    { status: 400 },
                );
            }
            if (parentDoc.parentExpenseId || parentDoc.parentIncomeId) {
                return NextResponse.json(
                    { success: false, message: 'Нельзя создать подтранзакцию для записи, которая уже является подтранзакцией' },
                    { status: 400 },
                );
            }
            if (Number(parentDoc.objectId) !== expenseData.objectId) {
                return NextResponse.json(
                    { success: false, message: 'Подтранзакция должна относиться к тому же объекту, что и родительская запись' },
                    { status: 400 },
                );
            }
            parentExpenseIdBin = parentOid;
        }

        if (parentIncomeIdRaw) {
            let parentOid: ObjectId;
            try {
                parentOid = new ObjectId(parentIncomeIdRaw);
            } catch {
                return NextResponse.json(
                    { success: false, message: 'Некорректный ID родительского дохода' },
                    { status: 400 },
                );
            }
            const parentDoc = await incomesCollection.findOne({ _id: parentOid, recordType: 'income' });
            if (!parentDoc) {
                return NextResponse.json(
                    { success: false, message: 'Родительский доход не найден' },
                    { status: 400 },
                );
            }
            if (parentDoc.parentExpenseId || parentDoc.parentIncomeId) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            'Нельзя создать подтранзакцию для записи, которая уже является подтранзакцией',
                    },
                    { status: 400 },
                );
            }
            if (Number(parentDoc.objectId) !== expenseData.objectId) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            'Подтранзакция должна относиться к тому же объекту, что и родительская запись',
                    },
                    { status: 400 },
                );
            }
            parentIncomeIdBin = parentOid;
        }

        const expenseToInsert = {
            recordType: 'expense' as const,
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
            parentExpenseId: parentExpenseIdBin,
            parentIncomeId: parentIncomeIdBin,
        };

        const result = await expensesCollection.insertOne(expenseToInsert as any);

        if (parentExpenseIdBin) {
            await expensesCollection.updateOne(
                { _id: parentExpenseIdBin },
                { $push: { childExpenseIds: result.insertedId } as any },
            );
        }
        if (parentIncomeIdBin) {
            await incomesCollection.updateOne(
                { _id: parentIncomeIdBin },
                { $push: { childExpenseIds: result.insertedId } as any },
            );
        }

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
            id: result.insertedId.toString(),
        });
    } catch (error) {
        console.error('Error in POST /api/expenses:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}


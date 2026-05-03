import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { Income, IncomeStatus } from '@/lib/types';
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
        const incomesCollection = db.collection('incomes');

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

        const incomes = await incomesCollection
            .find(filter)
            .sort({ date: -1, createdAt: -1 })
            .toArray();

        const serialized = incomes.map((doc) => ({
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

        if (incomeData.amount < 0) {
            return NextResponse.json(
                { success: false, message: 'Стоимость не может быть отрицательной' },
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

        if (
            await hasDuplicateForForbidCategory(db, 'incomes', 'income', {
                objectId: incomeData.objectId,
                category: incomeData.category,
                roomName: incomeData.roomName ?? null,
                reportMonth: incomeData.reportMonth,
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

        const incomesCollection = db.collection('incomes');
        const expensesCollection = db.collection('expenses');

        const parentExpenseIdRaw =
            incomeData.parentExpenseId != null && String(incomeData.parentExpenseId).trim() !== ''
                ? String(incomeData.parentExpenseId).trim()
                : null;
        const parentIncomeIdRaw =
            incomeData.parentIncomeId != null && String(incomeData.parentIncomeId).trim() !== ''
                ? String(incomeData.parentIncomeId).trim()
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
                    {
                        success: false,
                        message:
                            'Нельзя создать подтранзакцию для записи, которая уже является подтранзакцией',
                    },
                    { status: 400 },
                );
            }
            if (Number(parentDoc.objectId) !== incomeData.objectId) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            'Подтранзакция должна относиться к тому же объекту, что и родительская запись',
                    },
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
            if (Number(parentDoc.objectId) !== incomeData.objectId) {
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

        const incomeToInsert = {
            recordType: 'income' as const,
            objectId: incomeData.objectId,
            roomName: incomeData.roomName ?? null,
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
            parentExpenseId: parentExpenseIdBin,
            parentIncomeId: parentIncomeIdBin,
        };

        const result = await incomesCollection.insertOne(incomeToInsert as any);

        if (parentExpenseIdBin) {
            await expensesCollection.updateOne(
                { _id: parentExpenseIdBin },
                { $push: { childIncomeIds: result.insertedId } as any },
            );
        }
        if (parentIncomeIdBin) {
            await incomesCollection.updateOne(
                { _id: parentIncomeIdBin },
                { $push: { childIncomeIds: result.insertedId } as any },
            );
        }

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
            id: result.insertedId.toString(),
        });
    } catch (error) {
        console.error('Error in POST /api/incomes:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}


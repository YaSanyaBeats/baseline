import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { Income, IncomeStatus } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';
import { hasDuplicateForForbidCategory } from '@/lib/accountancyDuplicateGuard';

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
        const userId = (session.user as any)._id?.toString?.() ?? (session.user as any)._id;

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

        if (incomeData.amount < 0) {
            return NextResponse.json(
                { success: false, message: 'Стоимость не может быть отрицательной' },
                { status: 400 },
            );
        }

        const quantity = incomeData.quantity != null && Number.isInteger(incomeData.quantity) && incomeData.quantity >= 1
            ? incomeData.quantity
            : 1;

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

        const isAdminOrAccountant = userRole === 'admin' || userRole === 'accountant';
        const ownerId = existingIncome.accountantId?.toString?.() ?? existingIncome.accountantId;
        const isOwnDraft = hasCashflow && !isAdminOrAccountant && ownerId === userId && existingIncome.status === 'draft';
        if (!isAdminOrAccountant && !isOwnDraft) {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав или можно редактировать только свои черновики.' },
                { status: 403 },
            );
        }
        if (isOwnDraft && incomeData.status && incomeData.status !== 'draft') {
            return NextResponse.json(
                { success: false, message: 'Пользователи с кешфлоу не могут менять статус на «Подтверждён».' },
                { status: 400 },
            );
        }

        const allowedStatuses: IncomeStatus[] = ['draft', 'confirmed'];
        const status = incomeData.status && allowedStatuses.includes(incomeData.status)
            ? incomeData.status
            : (existingIncome.status && allowedStatuses.includes(existingIncome.status as IncomeStatus)
                ? existingIncome.status
                : 'draft');

        if (
            await hasDuplicateForForbidCategory(db, 'incomes', 'income', {
                objectId: incomeData.objectId,
                category: incomeData.category,
                roomId: incomeData.roomId ?? null,
                reportMonth: incomeData.reportMonth,
                excludeObjectId: new ObjectId(incomeData._id),
            })
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        'Для этой категории включён запрет дублей: уже есть запись с тем же объектом, комнатой, категорией и отчётным месяцем.',
                },
                { status: 400 },
            );
        }

        const updateData: any = {
            recordType: 'income',
            objectId: incomeData.objectId,
            roomId: incomeData.roomId ?? null,
            bookingId: incomeData.bookingId ?? null,
            source: incomeData.source ?? null,
            recipient: incomeData.recipient ?? null,
            cashflowId:
                incomeData.cashflowId !== undefined
                    ? (incomeData.cashflowId ?? null)
                    : (existingIncome.cashflowId ?? null),
            category: incomeData.category,
            amount: incomeData.amount,
            quantity,
            date: new Date(incomeData.date),
            comment: incomeData.comment ?? '',
            reportMonth: incomeData.reportMonth || null,
            status,
            attachments: incomeData.attachments ?? [],
            autoCreated: null,
        };

        await incomesCollection.updateOne(
            { _id: new ObjectId(incomeData._id) },
            { $set: updateData },
        );

        // Логируем обновление дохода
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'income',
            entityId: incomeData._id,
            action: 'update',
            userId,
            userName,
            userRole,
            description: `Обновлён доход: ${incomeData.category}, сумма ${quantity * incomeData.amount}`,
            oldData: existingIncome,
            newData: updateData,
            metadata: {
                objectId: incomeData.objectId,
                bookingId: incomeData.bookingId,
                category: incomeData.category,
                amount: incomeData.amount,
            },
        });

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


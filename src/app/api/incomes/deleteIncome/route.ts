import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';

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

        // Логируем удаление дохода
        const userId = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'income',
            entityId: id,
            action: 'delete',
            userId,
            userName,
            userRole,
            description: `Удалён доход: ${existingIncome.category}, сумма ${(existingIncome.quantity ?? 1) * (existingIncome.amount ?? 0)}`,
            oldData: existingIncome,
            metadata: {
                objectId: existingIncome.objectId,
                bookingId: existingIncome.bookingId,
                category: existingIncome.category,
                amount: (existingIncome.quantity ?? 1) * (existingIncome.amount ?? 0),
            },
        });

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


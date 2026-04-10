import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
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
        const hasCashflow = Boolean((session.user as any).hasCashflow);
        const userId = (session.user as any)._id?.toString?.() ?? (session.user as any)._id;

        const db = await getDB();
        const expensesCollection = db.collection('expenses');

        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID расхода не указан' },
                { status: 400 },
            );
        }

        let existingExpense;
        try {
            existingExpense = await expensesCollection.findOne({ _id: new ObjectId(id) });
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

        const isAdminOrAccountant = userRole === 'admin' || userRole === 'accountant';
        const ownerId = existingExpense.accountantId?.toString?.() ?? existingExpense.accountantId;
        const isOwnDraft = hasCashflow && !isAdminOrAccountant && ownerId === userId && existingExpense.status === 'draft';
        if (!isAdminOrAccountant && !isOwnDraft) {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав или можно удалять только свои черновики.' },
                { status: 403 },
            );
        }

        await expensesCollection.deleteOne({ _id: new ObjectId(id) });

        // Логируем удаление расхода
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'expense',
            entityId: id,
            action: 'delete',
            userId,
            userName,
            userRole,
            description: `Удалён расход: ${existingExpense.category}, сумма ${(existingExpense.quantity ?? 1) * (existingExpense.amount ?? 0)}`,
            oldData: existingExpense,
            metadata: {
                objectId: existingExpense.objectId,
                bookingId: existingExpense.bookingId,
                category: existingExpense.category,
                amount: (existingExpense.quantity ?? 1) * (existingExpense.amount ?? 0),
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Расход успешно удалён',
        });
    } catch (error) {
        console.error('Error in DELETE /api/expenses/deleteExpense:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}


import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';

/**
 * Проставляет поле recordType у существующих документов в коллекциях expenses / incomes.
 * Идемпотентно. Нужно для явной маркировки при дальнейшей консолидации и отчётах.
 * Доступ: админ и бухгалтер.
 */
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'admin' && userRole !== 'accountant') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Миграция доступна только админу и бухгалтеру.' },
                { status: 403 },
            );
        }

        const db = await getDB();
        const expensesCollection = db.collection('expenses');
        const incomesCollection = db.collection('incomes');

        const expRes = await expensesCollection.updateMany(
            { recordType: { $ne: 'expense' } },
            { $set: { recordType: 'expense' } },
        );
        const incRes = await incomesCollection.updateMany(
            { recordType: { $ne: 'income' } },
            { $set: { recordType: 'income' } },
        );

        return NextResponse.json({
            success: true,
            message: `Миграция выполнена: обновлено расходов ${expRes.modifiedCount}, доходов ${incRes.modifiedCount}.`,
            expensesUpdated: expRes.modifiedCount,
            incomesUpdated: incRes.modifiedCount,
        });
    } catch (error) {
        console.error('migrate-transaction-record-type:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

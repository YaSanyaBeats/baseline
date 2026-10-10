import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { migrateTransactionNumbers } from '@/lib/migrations/migrateTransactionNumbers';

/** Проставляет числовые ID существующим расходам и доходам. Доступ: админ и бухгалтер. */
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
        const stats = await migrateTransactionNumbers(db);
        const assigned = stats.expensesUpdated + stats.incomesUpdated;

        return NextResponse.json({
            success: true,
            message:
                assigned > 0
                    ? `Номера проставлены: расходов ${stats.expensesUpdated}, доходов ${stats.incomesUpdated}.`
                    : 'У всех транзакций номера уже есть.',
            stats,
        });
    } catch (error) {
        console.error('migrate-transaction-numbers:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

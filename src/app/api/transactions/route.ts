import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';
import type { TransactionListRow } from '@/lib/types';

function serializeMongoDoc<T extends Record<string, unknown>>(doc: T): T {
    const out = { ...doc } as T;
    const id = out._id as unknown;
    if (id instanceof ObjectId) {
        (out as { _id?: string })._id = id.toString();
    }
    return out;
}

/**
 * Единый список расходов и доходов для раздела «Транзакции».
 * Права доступа совпадают с GET /api/expenses и GET /api/incomes.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as { role?: string }).role;
        const hasCashflow = Boolean((session.user as { hasCashflow?: boolean }).hasCashflow);
        const userId =
            (session.user as { _id?: { toString?: () => string } | string })._id?.toString?.() ??
            (session.user as { _id?: string })._id;

        const db = await getDB();
        const expensesCollection = db.collection('expenses');
        const incomesCollection = db.collection('incomes');

        const filter: Record<string, unknown> = {};
        if (userRole !== 'admin' && userRole !== 'accountant') {
            if (hasCashflow && userId) {
                const userPrefix = `user:${userId}`;
                filter.$or = [{ source: userPrefix }, { recipient: userPrefix }];
            } else {
                return NextResponse.json(
                    { success: false, message: 'Недостаточно прав' },
                    { status: 403 },
                );
            }
        }

        const [expenseDocs, incomeDocs] = await Promise.all([
            expensesCollection.find(filter).sort({ date: -1, createdAt: -1 }).toArray(),
            incomesCollection.find(filter).sort({ date: -1, createdAt: -1 }).toArray(),
        ]);

        const expenseRows = expenseDocs.map((doc) => {
            const base = serializeMongoDoc(doc as Record<string, unknown>);
            return { ...base, recordType: 'expense' as const };
        });

        const incomeRows = incomeDocs.map((doc) => {
            const base = serializeMongoDoc(doc as Record<string, unknown>);
            return { ...base, recordType: 'income' as const };
        });

        const items: TransactionListRow[] = [...expenseRows, ...incomeRows] as TransactionListRow[];

        items.sort((a, b) => {
            const da = a.date ? new Date(a.date as string | Date).getTime() : 0;
            const db = b.date ? new Date(b.date as string | Date).getTime() : 0;
            if (da !== db) return db - da;
            const ca = a.createdAt ? new Date(a.createdAt as string | Date).getTime() : 0;
            const cb = b.createdAt ? new Date(b.createdAt as string | Date).getTime() : 0;
            return cb - ca;
        });

        return NextResponse.json({ items });
    } catch (error) {
        console.error('Error in GET /api/transactions:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

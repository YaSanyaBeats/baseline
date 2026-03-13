import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';

/**
 * Миграция: перенос значений из полей counterpartyId и cashflowId в поле recipient.
 * - counterpartyId -> recipient = "cp:" + counterpartyId
 * - cashflowId (кэшфлоу с userId) -> recipient = "user:" + userId
 * Приоритет: сначала counterpartyId, если нет — cashflowId.
 * Доступно только админу и бухгалтеру.
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

        const userRole = (session.user as any).role;
        if (userRole !== 'admin' && userRole !== 'accountant') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Миграция доступна только админу и бухгалтеру.' },
                { status: 403 },
            );
        }

        const db = await getDB();
        const expensesCollection = db.collection('expenses');
        const incomesCollection = db.collection('incomes');
        const cashflowsCollection = db.collection('cashflows');

        const cashflowsMap = new Map<string, { userId?: string }>();
        const cashflows = await cashflowsCollection.find({}).toArray();
        for (const cf of cashflows) {
            const id = cf._id?.toString?.();
            if (id) cashflowsMap.set(id, { userId: cf.userId?.toString?.() ?? cf.userId });
        }

        let expensesUpdated = 0;
        let incomesUpdated = 0;

        // Миграция расходов
        const expensesToMigrate = await expensesCollection
            .find({ $or: [{ counterpartyId: { $exists: true, $nin: [null, ''] } }, { cashflowId: { $exists: true, $nin: [null, ''] } }] })
            .toArray();

        for (const exp of expensesToMigrate) {
            let newRecipient: string | null = null;
            if (exp.counterpartyId) {
                newRecipient = `cp:${exp.counterpartyId}`;
            } else if (exp.cashflowId) {
                const cf = cashflowsMap.get(exp.cashflowId);
                if (cf?.userId) newRecipient = `user:${cf.userId}`;
            }

            if (newRecipient) {
                await expensesCollection.updateOne(
                    { _id: exp._id },
                    {
                        $set: { recipient: newRecipient },
                        $unset: { counterpartyId: '', cashflowId: '' } as any,
                    },
                );
                expensesUpdated++;
            } else if (exp.counterpartyId || exp.cashflowId) {
                await expensesCollection.updateOne(
                    { _id: exp._id },
                    { $unset: { counterpartyId: '', cashflowId: '' } as any },
                );
                expensesUpdated++;
            }
        }

        // Миграция доходов (у income нет counterpartyId, только cashflowId)
        const incomesToMigrate = await incomesCollection
            .find({ cashflowId: { $exists: true, $nin: [null, ''] } })
            .toArray();

        for (const inc of incomesToMigrate) {
            let newRecipient: string | null = null;
            if (inc.cashflowId) {
                const cf = cashflowsMap.get(inc.cashflowId);
                if (cf?.userId) newRecipient = `user:${cf.userId}`;
            }

            if (newRecipient) {
                await incomesCollection.updateOne(
                    { _id: inc._id },
                    {
                        $set: { recipient: newRecipient },
                        $unset: { cashflowId: '' } as any,
                    },
                );
                incomesUpdated++;
            } else {
                await incomesCollection.updateOne(
                    { _id: inc._id },
                    { $unset: { cashflowId: '' } as any },
                );
                incomesUpdated++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Миграция выполнена: обновлено расходов ${expensesUpdated}, доходов ${incomesUpdated}.`,
            expensesUpdated,
            incomesUpdated,
        });
    } catch (error) {
        console.error('Migration error:', error);
        return NextResponse.json(
            { success: false, message: 'Ошибка при выполнении миграции.' },
            { status: 500 },
        );
    }
}

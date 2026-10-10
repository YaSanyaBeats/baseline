import { ObjectId, type Db, type Document } from 'mongodb';
import { allocateTransactionNumbers, raiseTransactionNumberCounter } from '@/lib/transactionNumber';

export type MigrateTransactionNumbersStats = {
    expensesUpdated: number;
    incomesUpdated: number;
    alreadyNumbered: number;
    firstAssigned: number | null;
    lastAssigned: number | null;
};

const MISSING_NUMBER = {
    $or: [
        { transactionNumber: { $exists: false } },
        { transactionNumber: null },
        { transactionNumber: { $not: { $type: 'number' } } },
    ],
};

function sortTime(doc: Document): number {
    if (doc.createdAt) {
        const time = new Date(doc.createdAt as string | Date).getTime();
        if (!Number.isNaN(time)) return time;
    }
    if (doc._id instanceof ObjectId) return doc._id.getTimestamp().getTime();
    return 0;
}

async function maxTransactionNumber(db: Db): Promise<number> {
    const [expensesMax, incomesMax] = await Promise.all([
        db.collection('expenses').aggregate<{ max: number }>([
            { $match: { transactionNumber: { $type: 'number' } } },
            { $group: { _id: null, max: { $max: '$transactionNumber' } } },
        ]).toArray(),
        db.collection('incomes').aggregate<{ max: number }>([
            { $match: { transactionNumber: { $type: 'number' } } },
            { $group: { _id: null, max: { $max: '$transactionNumber' } } },
        ]).toArray(),
    ]);
    return Math.max(Number(expensesMax[0]?.max) || 0, Number(incomesMax[0]?.max) || 0);
}

/**
 * Проставляет transactionNumber записям без номера.
 * Порядок — по дате создания, от старых к новым. Уже выданные номера не меняются.
 */
export async function migrateTransactionNumbers(db: Db): Promise<MigrateTransactionNumbersStats> {
    const expenses = db.collection('expenses');
    const incomes = db.collection('incomes');

    const [expenseDocs, incomeDocs, expenseNumbered, incomeNumbered, currentMax] = await Promise.all([
        expenses.find(MISSING_NUMBER, { projection: { _id: 1, createdAt: 1 } }).toArray(),
        incomes.find(MISSING_NUMBER, { projection: { _id: 1, createdAt: 1 } }).toArray(),
        expenses.countDocuments({ transactionNumber: { $type: 'number' } }),
        incomes.countDocuments({ transactionNumber: { $type: 'number' } }),
        maxTransactionNumber(db),
    ]);

    const pending = [
        ...expenseDocs.map((doc) => ({ collection: 'expenses' as const, doc })),
        ...incomeDocs.map((doc) => ({ collection: 'incomes' as const, doc })),
    ].sort((a, b) => {
        const byTime = sortTime(a.doc) - sortTime(b.doc);
        if (byTime !== 0) return byTime;
        return String(a.doc._id).localeCompare(String(b.doc._id));
    });

    if (pending.length === 0) {
        await raiseTransactionNumberCounter(db, currentMax);
        return {
            expensesUpdated: 0,
            incomesUpdated: 0,
            alreadyNumbered: expenseNumbered + incomeNumbered,
            firstAssigned: null,
            lastAssigned: null,
        };
    }

    await raiseTransactionNumberCounter(db, currentMax);
    const numbers = await allocateTransactionNumbers(db, pending.length);

    const expenseOps = [];
    const incomeOps = [];
    for (let index = 0; index < pending.length; index += 1) {
        const item = pending[index];
        const op = {
            updateOne: {
                filter: { _id: item.doc._id, ...MISSING_NUMBER },
                update: { $set: { transactionNumber: numbers[index] } },
            },
        };
        if (item.collection === 'expenses') expenseOps.push(op);
        else incomeOps.push(op);
    }

    let expensesUpdated = 0;
    let incomesUpdated = 0;
    const chunk = 500;
    for (let offset = 0; offset < expenseOps.length; offset += chunk) {
        const result = await expenses.bulkWrite(expenseOps.slice(offset, offset + chunk), { ordered: false });
        expensesUpdated += result.modifiedCount;
    }
    for (let offset = 0; offset < incomeOps.length; offset += chunk) {
        const result = await incomes.bulkWrite(incomeOps.slice(offset, offset + chunk), { ordered: false });
        incomesUpdated += result.modifiedCount;
    }

    return {
        expensesUpdated,
        incomesUpdated,
        alreadyNumbered: expenseNumbered + incomeNumbered,
        firstAssigned: numbers[0] ?? null,
        lastAssigned: numbers[numbers.length - 1] ?? null,
    };
}

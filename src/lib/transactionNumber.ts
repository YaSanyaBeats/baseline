import type { Db } from 'mongodb';

const COUNTER_ID = 'transactionNumber';

type TransactionCounter = {
    _id: string;
    seq: number;
};

function counters(db: Db) {
    return db.collection<TransactionCounter>('counters');
}

let indexesReady: Promise<void> | null = null;

/** Уникальный числовой ID внутри каждой коллекции. Общая последовательность — в счётчике. */
function ensureTransactionNumberIndexes(db: Db): Promise<void> {
    if (!indexesReady) {
        indexesReady = Promise.all([
            db.collection('expenses').createIndex(
                { transactionNumber: 1 },
                {
                    unique: true,
                    name: 'expenses_transactionNumber',
                    partialFilterExpression: { transactionNumber: { $type: 'number' } },
                },
            ),
            db.collection('incomes').createIndex(
                { transactionNumber: 1 },
                {
                    unique: true,
                    name: 'incomes_transactionNumber',
                    partialFilterExpression: { transactionNumber: { $type: 'number' } },
                },
            ),
        ])
            .then(() => undefined)
            .catch((error) => {
                indexesReady = null;
                throw error;
            });
    }
    return indexesReady;
}

/** Следующие номера 1, 2, 3… Общие для расходов и доходов, без повторов. */
export async function allocateTransactionNumbers(db: Db, count: number): Promise<number[]> {
    if (count <= 0) return [];
    await ensureTransactionNumberIndexes(db);
    const updated = await counters(db).findOneAndUpdate(
        { _id: COUNTER_ID },
        { $inc: { seq: count } },
        { upsert: true, returnDocument: 'after' },
    );
    const end = Number(updated?.seq);
    if (!Number.isFinite(end)) {
        throw new Error('Не удалось выдать номер транзакции');
    }
    const start = end - count + 1;
    return Array.from({ length: count }, (_, index) => start + index);
}

export async function allocateTransactionNumber(db: Db): Promise<number> {
    const [number] = await allocateTransactionNumbers(db, 1);
    return number;
}

/** Не опускает счётчик: уже выданные номера не переиспользуются. */
export async function raiseTransactionNumberCounter(db: Db, atLeast: number): Promise<void> {
    if (!Number.isFinite(atLeast) || atLeast < 0) return;
    await ensureTransactionNumberIndexes(db);
    await counters(db).updateOne(
        { _id: COUNTER_ID },
        { $max: { seq: atLeast } },
        { upsert: true },
    );
}

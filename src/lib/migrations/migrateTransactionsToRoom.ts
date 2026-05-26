import type { Db } from 'mongodb';
import { formatRoomSourceRecipient } from '@/lib/roomBinding';
import { parseSourceRecipientValue } from '@/lib/sourceRecipientParse';

export type MigrateTransactionsToRoomParams = {
    reportMonth: string;
    objectId: number;
    sourceRoomName: string;
    destinationRoomName: string;
    /** Если true — только транзакции с заполненным bookingId */
    onlyBookingLinked?: boolean;
};

export type MigrateTransactionsToRoomStats = {
    expensesUpdated: number;
    incomesUpdated: number;
};

function referencesSourceRoom(
    value: unknown,
    objectId: number,
    sourceRoomName: string,
): boolean {
    if (typeof value !== 'string') return false;
    const parsed = parseSourceRecipientValue(value);
    if (!parsed || parsed.type !== 'room') return false;
    return parsed.objectId === objectId && parsed.roomName.trim() === sourceRoomName.trim();
}

async function migrateCollection(
    db: Db,
    collectionName: 'expenses' | 'incomes',
    params: MigrateTransactionsToRoomParams,
): Promise<number> {
    const { reportMonth, objectId, sourceRoomName, destinationRoomName, onlyBookingLinked } = params;
    const source = sourceRoomName.trim();
    const destination = destinationRoomName.trim();
    const destinationRoomToken = formatRoomSourceRecipient(objectId, destination);

    const coll = db.collection(collectionName);
    let updated = 0;

    for await (const doc of coll.find({
        reportMonth,
        objectId,
        roomName: source,
        ...(onlyBookingLinked ? { bookingId: { $exists: true, $ne: null } } : {}),
    })) {
        const set: Record<string, unknown> = { roomName: destination };
        if (referencesSourceRoom(doc.source, objectId, source)) {
            set.source = destinationRoomToken;
        }
        if (referencesSourceRoom(doc.recipient, objectId, source)) {
            set.recipient = destinationRoomToken;
        }
        await coll.updateOne({ _id: doc._id }, { $set: set });
        updated++;
    }

    return updated;
}

export async function runMigrateTransactionsToRoom(
    db: Db,
    params: MigrateTransactionsToRoomParams,
): Promise<MigrateTransactionsToRoomStats> {
    const [expensesUpdated, incomesUpdated] = await Promise.all([
        migrateCollection(db, 'expenses', params),
        migrateCollection(db, 'incomes', params),
    ]);

    return { expensesUpdated, incomesUpdated };
}

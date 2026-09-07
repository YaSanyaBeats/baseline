import { getDB } from '@/lib/db/getDB';
import { logAuditAction } from '@/lib/auditLog';
import { IP_COLLECTIONS } from './collections';
import type { IpJournalEntry } from './types';

export async function writePricingJournal(entry: Omit<IpJournalEntry, 'ts'> & { ts?: Date }): Promise<void> {
    const db = await getDB();
    const doc: IpJournalEntry = {
        ...entry,
        ts: entry.ts ?? new Date(),
    };
    await db.collection(IP_COLLECTIONS.journal).insertOne(doc as never);

    await logAuditAction({
        entity: 'pricing',
        action: 'update',
        userId: entry.userId,
        userName: entry.userName,
        userRole: 'admin',
        description: `${entry.type}: ${entry.target} — ${entry.detail}`,
        newData: entry.payload,
        metadata: {},
    });
}

export async function listPricingJournal(params: {
    type?: string;
    userName?: string;
    limit?: number;
    skip?: number;
}) {
    const db = await getDB();
    const filter: Record<string, unknown> = {};
    if (params.type) filter.type = params.type;
    if (params.userName) filter.userName = params.userName;
    const limit = Math.min(params.limit ?? 100, 500);
    const skip = params.skip ?? 0;
    const col = db.collection(IP_COLLECTIONS.journal);
    const [items, total] = await Promise.all([
        col.find(filter).sort({ ts: -1 }).skip(skip).limit(limit).toArray(),
        col.countDocuments(filter),
    ]);
    return { items, total, limit, skip };
}

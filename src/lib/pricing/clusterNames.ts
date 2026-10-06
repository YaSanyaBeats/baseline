import { getDB } from '@/lib/db/getDB';
import { IP_COLLECTIONS } from './collections';

const DOC_ID = 'clusterNames';

export async function listSavedClusterNames(): Promise<string[]> {
    const db = await getDB();
    const doc = await db.collection(IP_COLLECTIONS.settings).findOne({ _id: DOC_ID as never });
    const names = Array.isArray(doc?.names) ? doc.names : [];
    return [...new Set(names.map((n: unknown) => String(n).trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'ru'),
    );
}

export async function rememberClusterName(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const db = await getDB();
    await db.collection(IP_COLLECTIONS.settings).updateOne(
        { _id: DOC_ID as never },
        { $addToSet: { names: trimmed } },
        { upsert: true },
    );
}

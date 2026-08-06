import type { Db } from 'mongodb';
import { resolvePropertyIdForMetadata, type RawBedsObjectForRoom } from '@/lib/roomBinding';

async function loadRawObjectsForMetadata(db: Db): Promise<RawBedsObjectForRoom[]> {
    const [internalDocs, bedsDocs] = await Promise.all([
        db.collection('internalObjects').find({}).toArray(),
        db.collection('objects').find({}).toArray(),
    ]);
    return [...internalDocs, ...bedsDocs] as RawBedsObjectForRoom[];
}

export async function resolveMetadataPropertyId(db: Db, accountingObjectId: number): Promise<number> {
    const rawObjects = await loadRawObjectsForMetadata(db);
    return resolvePropertyIdForMetadata(rawObjects, accountingObjectId);
}

export { loadRawObjectsForMetadata };

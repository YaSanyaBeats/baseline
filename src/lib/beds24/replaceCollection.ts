import type { Db } from 'mongodb';

const INSERT_CHUNK = 100;

function isNamespaceNotFound(error: unknown): boolean {
    const err = error as { code?: number; codeName?: string };
    return err?.code === 26 || err?.codeName === 'NamespaceNotFound';
}

/** Полная замена коллекции. Сначала пишем во временную, затем rename — обрыв не оставляет пустую рабочую коллекцию. */
export async function replaceCollection(
    db: Db,
    collectionName: string,
    docs: Record<string, unknown>[],
): Promise<void> {
    const incomingName = `${collectionName}__incoming`;
    const incoming = db.collection(incomingName);

    try {
        await incoming.drop();
    } catch (error) {
        if (!isNamespaceNotFound(error)) throw error;
    }

    if (docs.length === 0) {
        await db.createCollection(incomingName);
    } else {
        for (let i = 0; i < docs.length; i += INSERT_CHUNK) {
            await incoming.insertMany(docs.slice(i, i + INSERT_CHUNK), { ordered: false });
        }
    }

    await incoming.rename(collectionName, { dropTarget: true });
}

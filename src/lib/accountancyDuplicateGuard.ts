import type { Db } from 'mongodb';
import type { ObjectId } from 'mongodb';

function normalizeReportMonth(rm: unknown): string {
    if (rm == null || rm === '') return '';
    return String(rm);
}

function normalizeObjectId(obj: unknown): string {
    if (obj == null || obj === '') return '';
    const n = Number(obj);
    return Number.isFinite(n) ? String(n) : String(obj);
}

/** Единый ключ комнаты по имени юнита */
function normalizeRoomName(room: unknown): string {
    if (room == null || room === '') return '';
    return String(room).trim();
}

/** Есть ли категория с таким именем и флагом «запретить дубли». */
export async function categoryForbidsDuplicates(
    db: Db,
    categoryName: string,
    type: 'expense' | 'income',
): Promise<boolean> {
    const trimmed = categoryName.trim();
    if (!trimmed) return false;
    const col = db.collection('accountancyCategories');
    const n = await col.countDocuments({ type, name: trimmed, forbidDuplicates: true });
    return n > 0;
}

type CollectionName = 'expenses' | 'incomes';

/**
 * Дубль: тот же объект + та же комната + та же категория + тот же отчётный месяц.
 * bookingId не используется.
 */
export async function findDuplicateCategoryObjectRoomMonthRow(
    db: Db,
    collectionName: CollectionName,
    params: {
        objectId: number;
        category: string;
        roomName: string | null | undefined;
        reportMonth: unknown;
        excludeObjectId?: ObjectId;
    },
): Promise<{ _id: unknown } | null> {
    const trimmed = params.category.trim();
    const targetMonth = normalizeReportMonth(params.reportMonth);
    const targetRoom = normalizeRoomName(params.roomName);
    const targetObject = normalizeObjectId(params.objectId);
    const coll = db.collection(collectionName);
    const objectIdNum = Number(params.objectId);
    const filter = Number.isFinite(objectIdNum)
        ? { category: trimmed, objectId: objectIdNum }
        : { category: trimmed };
    const candidates = await coll.find(filter).toArray();
    for (const doc of candidates) {
        if (
            params.excludeObjectId &&
            String(doc._id) === String(params.excludeObjectId)
        )
            continue;
        if (normalizeObjectId(doc.objectId) !== targetObject) continue;
        if (normalizeReportMonth(doc.reportMonth) !== targetMonth) continue;
        if (normalizeRoomName(doc.roomName) !== targetRoom) continue;
        return doc;
    }
    return null;
}

/** true — уже есть строка, новую создавать нельзя (категория с forbidDuplicates). */
export async function hasDuplicateForForbidCategory(
    db: Db,
    collectionName: CollectionName,
    categoryType: 'expense' | 'income',
    params: {
        objectId: number;
        category: string;
        roomName: string | null | undefined;
        reportMonth: unknown;
        excludeObjectId?: ObjectId;
    },
): Promise<boolean> {
    const forbids = await categoryForbidsDuplicates(db, params.category, categoryType);
    if (!forbids) return false;
    const dup = await findDuplicateCategoryObjectRoomMonthRow(db, collectionName, params);
    return dup != null;
}

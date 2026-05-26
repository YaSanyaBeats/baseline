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
): Promise<Record<string, unknown> | null> {
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
        return doc as Record<string, unknown>;
    }
    return null;
}

/** Сумма строки: amount × quantity. */
export function transactionLineTotal(doc: { amount?: unknown; quantity?: unknown }): number {
    const amount = typeof doc.amount === 'number' ? doc.amount : Number(doc.amount) || 0;
    const quantity =
        typeof doc.quantity === 'number' && Number.isInteger(doc.quantity) && doc.quantity >= 1
            ? doc.quantity
            : 1;
    return amount * quantity;
}

/** Транзакция с нулевой суммой (amount × quantity === 0). */
export function isZeroAmountTransaction(doc: { amount?: unknown; quantity?: unknown }): boolean {
    return transactionLineTotal(doc) === 0;
}

export type ForbidDuplicateCreateResolution =
    | { action: 'proceed' }
    | { action: 'overwrite'; existingId: ObjectId; existingDoc: Record<string, unknown> }
    | {
          action: 'confirm';
          existingId: ObjectId;
          existingAmount: number;
          existingLineTotal: number;
      };

type DuplicateLookupParams = {
    objectId: number;
    category: string;
    roomName: string | null | undefined;
    reportMonth: unknown;
    excludeObjectId?: ObjectId;
};

/**
 * При создании транзакции в категории с forbidDuplicates:
 * - нет дубля → proceed (insert);
 * - дубль с суммой 0 → overwrite;
 * - дубль с ненулевой суммой и allowDuplicate → proceed (insert второй записи);
 * - дубль с ненулевой суммой → confirm (нужен выбор пользователя).
 */
export async function resolveForbidDuplicateOnCreate(
    db: Db,
    collectionName: CollectionName,
    categoryType: 'expense' | 'income',
    params: DuplicateLookupParams,
    allowDuplicate: boolean,
): Promise<ForbidDuplicateCreateResolution> {
    const forbids = await categoryForbidsDuplicates(db, params.category, categoryType);
    if (!forbids) return { action: 'proceed' };

    const dup = await findDuplicateCategoryObjectRoomMonthRow(db, collectionName, params);
    if (!dup) return { action: 'proceed' };

    const existingId = dup._id as ObjectId;
    if (isZeroAmountTransaction(dup)) {
        return { action: 'overwrite', existingId, existingDoc: dup as Record<string, unknown> };
    }
    if (allowDuplicate) return { action: 'proceed' };

    const existingAmount = typeof dup.amount === 'number' ? dup.amount : Number(dup.amount) || 0;
    return {
        action: 'confirm',
        existingId,
        existingAmount,
        existingLineTotal: transactionLineTotal(dup),
    };
}

/** true — уже есть строка, новую создавать нельзя (категория с forbidDuplicates). */
export async function hasDuplicateForForbidCategory(
    db: Db,
    collectionName: CollectionName,
    categoryType: 'expense' | 'income',
    params: DuplicateLookupParams,
): Promise<boolean> {
    const resolution = await resolveForbidDuplicateOnCreate(db, collectionName, categoryType, params, false);
    return resolution.action === 'confirm';
}

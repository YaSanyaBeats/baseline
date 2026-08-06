import type { Db } from 'mongodb';
import type { ObjectId } from 'mongodb';
import { ObjectId as MongoObjectId } from 'mongodb';
import {
    duplicateRuleBlockedMessage,
    resolveCategoryDuplicateRule,
} from '@/lib/accountancyCategoryDuplicateRule';
import { normalizeMongoIdString } from '@/lib/mongoId';
import type { AccountancyCategory, CategoryDuplicateRule, ExistingDuplicateRow } from '@/lib/types';

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

function normalizeBookingId(bookingId: unknown): number | null {
    if (bookingId == null || bookingId === '') return null;
    const n = Number(bookingId);
    return Number.isFinite(n) ? n : null;
}

function categoryFieldMatches(
    doc: Record<string, unknown>,
    params: { category: string; categoryId?: string | null },
): boolean {
    const paramCategoryId = normalizeMongoIdString(params.categoryId).trim();
    const docCategoryId = normalizeMongoIdString(doc.categoryId).trim();
    if (paramCategoryId && docCategoryId) return docCategoryId === paramCategoryId;
    return String(doc.category ?? '').trim() === params.category.trim();
}

export async function getCategoryDuplicateRule(
    db: Db,
    categoryName: string,
    categoryType: 'expense' | 'income',
    categoryId?: string | null,
): Promise<CategoryDuplicateRule> {
    const col = db.collection('accountancyCategories');
    const id = normalizeMongoIdString(categoryId).trim();
    if (id) {
        try {
            const byId = await col.findOne({ _id: new MongoObjectId(id) });
            if (byId) return resolveCategoryDuplicateRule(byId as unknown as AccountancyCategory);
        } catch {
            // ignore invalid id
        }
    }
    const trimmed = categoryName.trim();
    if (!trimmed) return 'off';
    const byName = await col.findOne({ type: categoryType, name: trimmed });
    return resolveCategoryDuplicateRule(byName as unknown as AccountancyCategory | null);
}

/** @deprecated Используйте getCategoryDuplicateRule */
export async function categoryForbidsDuplicates(
    db: Db,
    categoryName: string,
    type: 'expense' | 'income',
): Promise<boolean> {
    const rule = await getCategoryDuplicateRule(db, categoryName, type);
    return rule !== 'off';
}

type CollectionName = 'expenses' | 'incomes';

type DuplicateLookupParams = {
    objectId: number;
    category: string;
    categoryId?: string | null;
    roomName: string | null | undefined;
    reportMonth: unknown;
    bookingId?: number | null | undefined;
    excludeObjectId?: ObjectId;
};

async function buildObjectDisplayNameMap(db: Db): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    const objects = await db.collection('objects').find({}).toArray();
    for (const obj of objects) {
        const name = String(obj.name ?? '').trim();
        if (!name) continue;
        if (typeof obj.id === 'number') map.set(obj.id, name);
        for (const rt of obj.roomTypes || []) {
            if (rt != null && typeof rt.id === 'number') map.set(rt.id, name);
        }
    }
    return map;
}

function toExistingDuplicateRow(
    doc: Record<string, unknown>,
    objectNameMap: Map<number, string>,
): ExistingDuplicateRow {
    const objectId = typeof doc.objectId === 'number' ? doc.objectId : Number(doc.objectId) || 0;
    const roomName = normalizeRoomName(doc.roomName) || '—';
    const amount = typeof doc.amount === 'number' ? doc.amount : Number(doc.amount) || 0;
    return {
        objectId,
        objectName: objectNameMap.get(objectId) ?? String(objectId),
        roomName,
        amount,
        lineTotal: transactionLineTotal(doc),
    };
}

/**
 * Дубль за период: тот же объект + та же комната + та же категория + тот же отчётный месяц.
 * bookingId не используется.
 */
export async function findAllDuplicateCategoryObjectRoomMonthRows(
    db: Db,
    collectionName: CollectionName,
    params: DuplicateLookupParams,
): Promise<Record<string, unknown>[]> {
    const targetMonth = normalizeReportMonth(params.reportMonth);
    const targetRoom = normalizeRoomName(params.roomName);
    const targetObject = normalizeObjectId(params.objectId);
    const coll = db.collection(collectionName);
    const objectIdNum = Number(params.objectId);
    const filter = Number.isFinite(objectIdNum)
        ? { objectId: objectIdNum }
        : {};
    const candidates = await coll.find(filter).toArray();
    const matches: Record<string, unknown>[] = [];
    for (const doc of candidates) {
        if (params.excludeObjectId && String(doc._id) === String(params.excludeObjectId)) continue;
        if (!categoryFieldMatches(doc as Record<string, unknown>, params)) continue;
        if (normalizeObjectId(doc.objectId) !== targetObject) continue;
        if (normalizeReportMonth(doc.reportMonth) !== targetMonth) continue;
        if (normalizeRoomName(doc.roomName) !== targetRoom) continue;
        matches.push(doc as Record<string, unknown>);
    }
    return matches;
}

/** @deprecated Используйте findAllDuplicateCategoryObjectRoomMonthRows */
export async function findDuplicateCategoryObjectRoomMonthRow(
    db: Db,
    collectionName: CollectionName,
    params: DuplicateLookupParams,
): Promise<Record<string, unknown> | null> {
    const rows = await findAllDuplicateCategoryObjectRoomMonthRows(db, collectionName, params);
    return rows[0] ?? null;
}

/**
 * Дубль на бронь: тот же объект + та же комната + та же категория + то же бронирование.
 * Отчётный месяц не используется.
 */
export async function findAllDuplicateCategoryObjectRoomBookingRows(
    db: Db,
    collectionName: CollectionName,
    params: DuplicateLookupParams,
): Promise<Record<string, unknown>[]> {
    const targetBookingId = normalizeBookingId(params.bookingId);
    if (targetBookingId == null) return [];

    const targetRoom = normalizeRoomName(params.roomName);
    const targetObject = normalizeObjectId(params.objectId);
    const coll = db.collection(collectionName);
    const objectIdNum = Number(params.objectId);
    const filter = Number.isFinite(objectIdNum)
        ? { objectId: objectIdNum, bookingId: targetBookingId }
        : { bookingId: targetBookingId };
    const candidates = await coll.find(filter).toArray();
    const matches: Record<string, unknown>[] = [];
    for (const doc of candidates) {
        if (params.excludeObjectId && String(doc._id) === String(params.excludeObjectId)) continue;
        if (!categoryFieldMatches(doc as Record<string, unknown>, params)) continue;
        if (normalizeObjectId(doc.objectId) !== targetObject) continue;
        if (normalizeBookingId(doc.bookingId) !== targetBookingId) continue;
        if (normalizeRoomName(doc.roomName) !== targetRoom) continue;
        matches.push(doc as Record<string, unknown>);
    }
    return matches;
}

/** @deprecated Используйте findAllDuplicateCategoryObjectRoomBookingRows */
export async function findDuplicateCategoryObjectRoomBookingRow(
    db: Db,
    collectionName: CollectionName,
    params: DuplicateLookupParams,
): Promise<Record<string, unknown> | null> {
    const rows = await findAllDuplicateCategoryObjectRoomBookingRows(db, collectionName, params);
    return rows[0] ?? null;
}

async function findAllDuplicatesForRule(
    db: Db,
    collectionName: CollectionName,
    rule: CategoryDuplicateRule,
    params: DuplicateLookupParams,
): Promise<Record<string, unknown>[]> {
    if (rule === 'off') return [];
    if (rule === 'per_booking') {
        return findAllDuplicateCategoryObjectRoomBookingRows(db, collectionName, params);
    }
    return findAllDuplicateCategoryObjectRoomMonthRows(db, collectionName, params);
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
          existingDuplicates: ExistingDuplicateRow[];
          duplicateRule: CategoryDuplicateRule;
      };

/**
 * При создании транзакции в категории с правилом запрета дублей:
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
    const rule = await getCategoryDuplicateRule(db, params.category, categoryType, params.categoryId);
    if (rule === 'off') return { action: 'proceed' };

    const dups = await findAllDuplicatesForRule(db, collectionName, rule, params);
    if (!dups.length) return { action: 'proceed' };

    const nonZeroDups = dups.filter((d) => !isZeroAmountTransaction(d));
    const dup = nonZeroDups[0] ?? dups[0];
    const existingId = dup._id as ObjectId;

    if (nonZeroDups.length === 0) {
        return { action: 'overwrite', existingId, existingDoc: dup as Record<string, unknown> };
    }
    if (allowDuplicate) return { action: 'proceed' };

    const objectNameMap = await buildObjectDisplayNameMap(db);
    const existingDuplicates = dups.map((d) => toExistingDuplicateRow(d, objectNameMap));
    const existingAmount = typeof dup.amount === 'number' ? dup.amount : Number(dup.amount) || 0;
    return {
        action: 'confirm',
        existingId,
        existingAmount,
        existingLineTotal: transactionLineTotal(dup),
        existingDuplicates,
        duplicateRule: rule,
    };
}

/** true — уже есть строка, новую создавать нельзя (категория с запретом дублей). */
export async function hasDuplicateForForbidCategory(
    db: Db,
    collectionName: CollectionName,
    categoryType: 'expense' | 'income',
    params: DuplicateLookupParams,
): Promise<boolean> {
    const resolution = await resolveForbidDuplicateOnCreate(db, collectionName, categoryType, params, false);
    return resolution.action === 'confirm';
}

export { duplicateRuleBlockedMessage };

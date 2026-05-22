import type { AccountancyCategory, AccountancyCategoryType, Expense, Income } from './types';
import { normalizeMongoIdString } from './mongoId';

export type CategoryRecordRef = {
    categoryId?: string | null;
    category?: string | null;
};

/** Карта categoryId → название категории. */
export function buildCategoryNameByIdMap(categories: AccountancyCategory[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const c of categories) {
        const id = c._id != null ? normalizeMongoIdString(c._id).trim() : '';
        if (id) map.set(id, c.name);
    }
    return map;
}

export function mergeCategoryNameMaps(...maps: Map<string, string>[]): Map<string, string> {
    const result = new Map<string, string>();
    for (const m of maps) {
        for (const [k, v] of m) mapSet(result, k, v);
    }
    return result;
}

function mapSet(map: Map<string, string>, key: string, value: string) {
    map.set(key, value);
}

/** Название категории: сначала по categoryId, иначе legacy-поле category. */
export function resolveCategoryName(
    record: CategoryRecordRef,
    nameById: Map<string, string>,
): string {
    const id = record.categoryId != null ? normalizeMongoIdString(record.categoryId).trim() : '';
    if (id && nameById.has(id)) return nameById.get(id)!;
    return String(record.category ?? '').trim();
}

export function resolveExpenseCategoryName(e: Expense, nameById: Map<string, string>): string {
    return resolveCategoryName(e, nameById);
}

export function resolveIncomeCategoryName(i: Income, nameById: Map<string, string>): string {
    return resolveCategoryName(i, nameById);
}

export function findCategoryById(
    categories: AccountancyCategory[],
    id: string,
): AccountancyCategory | undefined {
    const norm = normalizeMongoIdString(id).trim();
    return categories.find((c) => c._id != null && normalizeMongoIdString(c._id) === norm);
}

export function resolveCategoryFieldsFromId(
    categoryId: string,
    categories: AccountancyCategory[],
    type: AccountancyCategoryType,
): { categoryId: string; category: string } | null {
    const cat = findCategoryById(categories, categoryId);
    if (!cat || cat.type !== type) return null;
    return { categoryId: normalizeMongoIdString(cat._id!), category: cat.name };
}

export function resolveCategoryIdFromRecord(
    record: CategoryRecordRef,
    categories: AccountancyCategory[],
    type: AccountancyCategoryType,
): string {
    const existing = record.categoryId != null ? normalizeMongoIdString(record.categoryId).trim() : '';
    if (existing && findCategoryById(categories, existing)) return existing;
    const name = String(record.category ?? '').trim();
    if (!name) return '';
    const matches = categories.filter((c) => c.type === type && c.name === name);
    if (matches.length === 1 && matches[0]._id) {
        return normalizeMongoIdString(matches[0]._id);
    }
    return existing;
}

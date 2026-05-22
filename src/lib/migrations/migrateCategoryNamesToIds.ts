/**
 * Миграция: привязка транзакций и правил автоучёта к категориям по ID (categoryId),
 * а не только по имени (category).
 */

import type { Db, Document, ObjectId } from 'mongodb';
import type { AccountancyCategory, AccountancyCategoryType } from '@/lib/types';
import { normalizeMongoIdString } from '@/lib/mongoId';

export type MigrateCategoryIdsIssue = {
    collection: string;
    documentId: string;
    category: string;
    categoryIds?: string[];
};

export type MigrateCategoryIdsCollectionStats = {
    scanned: number;
    updated: number;
    alreadyOk: number;
    skipped: number;
};

export type MigrateCategoryIdsStats = {
    categories: { total: number };
    expenses: MigrateCategoryIdsCollectionStats;
    incomes: MigrateCategoryIdsCollectionStats;
    autoAccountingRules: MigrateCategoryIdsCollectionStats;
    unmatched: MigrateCategoryIdsIssue[];
    ambiguous: MigrateCategoryIdsIssue[];
    errors: string[];
};

function normalizeCategoryName(name: unknown): string {
    return String(name ?? '').trim().toLowerCase();
}

function docIdStr(id: unknown): string {
    return normalizeMongoIdString(id);
}

type CategoryLookup = {
    byType: Record<AccountancyCategoryType, Map<string, string[]>>;
    byId: Map<string, AccountancyCategory>;
};

function buildCategoryLookup(categories: AccountancyCategory[]): CategoryLookup {
    const byType: Record<AccountancyCategoryType, Map<string, string[]>> = {
        expense: new Map(),
        income: new Map(),
    };
    const byId = new Map<string, AccountancyCategory>();

    for (const cat of categories) {
        const id = cat._id ? normalizeMongoIdString(cat._id) : '';
        if (!id) continue;
        byId.set(id, cat);
        const key = normalizeCategoryName(cat.name);
        if (!key) continue;
        const bucket = byType[cat.type].get(key) ?? [];
        bucket.push(id);
        byType[cat.type].set(key, bucket);
    }

    return { byType, byId };
}

function resolveCategoryId(
    categoryName: unknown,
    type: AccountancyCategoryType,
    lookup: CategoryLookup,
): { id: string | null; ambiguous: string[] | null } {
    const name = String(categoryName ?? '').trim();
    if (!name) return { id: null, ambiguous: null };
    const ids = lookup.byType[type].get(normalizeCategoryName(name));
    if (!ids?.length) return { id: null, ambiguous: null };
    if (ids.length === 1) return { id: ids[0], ambiguous: null };
    return { id: null, ambiguous: ids };
}

function isCategoryIdValid(
    categoryId: unknown,
    categoryName: unknown,
    type: AccountancyCategoryType,
    lookup: CategoryLookup,
): boolean {
    const id = categoryId != null ? normalizeMongoIdString(categoryId).trim() : '';
    if (!id) return false;
    const cat = lookup.byId.get(id);
    if (!cat || cat.type !== type) return false;
    const expectedName = String(categoryName ?? '').trim();
    if (!expectedName) return true;
    return normalizeCategoryName(cat.name) === normalizeCategoryName(expectedName);
}

type ProcessDocResult = 'updated' | 'alreadyOk' | 'skipped';

async function processDocument(params: {
    collection: string;
    doc: Document;
    type: AccountancyCategoryType;
    lookup: CategoryLookup;
    dryRun: boolean;
    stats: MigrateCategoryIdsStats;
    coll: ReturnType<Db['collection']>;
}): Promise<ProcessDocResult> {
    const { collection, doc, type, lookup, dryRun, stats, coll } = params;
    const docId = docIdStr(doc._id);
    const categoryName = doc.category;
    const existingCategoryId = doc.categoryId;

    if (isCategoryIdValid(existingCategoryId, categoryName, type, lookup)) {
        return 'alreadyOk';
    }

    const resolved = resolveCategoryId(categoryName, type, lookup);
    if (resolved.ambiguous) {
        stats.ambiguous.push({
            collection,
            documentId: docId,
            category: String(categoryName ?? ''),
            categoryIds: resolved.ambiguous,
        });
        return 'skipped';
    }

    if (!resolved.id) {
        if (String(categoryName ?? '').trim()) {
            stats.unmatched.push({
                collection,
                documentId: docId,
                category: String(categoryName ?? ''),
            });
        }
        return 'skipped';
    }

    const matchedCategory = lookup.byId.get(resolved.id);
    const update: Record<string, unknown> = { categoryId: resolved.id };
    if (matchedCategory?.name && String(categoryName ?? '').trim() !== matchedCategory.name) {
        update.category = matchedCategory.name;
    }

    if (!dryRun) {
        await coll.updateOne({ _id: doc._id as ObjectId }, { $set: update });
    }
    return 'updated';
}

export async function runMigrateCategoryNamesToIds(
    db: Db,
    options?: { dryRun?: boolean },
): Promise<MigrateCategoryIdsStats> {
    const dryRun = options?.dryRun === true;
    const stats: MigrateCategoryIdsStats = {
        categories: { total: 0 },
        expenses: { scanned: 0, updated: 0, alreadyOk: 0, skipped: 0 },
        incomes: { scanned: 0, updated: 0, alreadyOk: 0, skipped: 0 },
        autoAccountingRules: { scanned: 0, updated: 0, alreadyOk: 0, skipped: 0 },
        unmatched: [],
        ambiguous: [],
        errors: [],
    };

    const categoriesRaw = await db
        .collection<AccountancyCategory>('accountancyCategories')
        .find({})
        .toArray();
    const categories: AccountancyCategory[] = categoriesRaw.map((c) => ({
        ...c,
        _id: docIdStr(c._id),
    }));
    stats.categories.total = categories.length;
    const lookup = buildCategoryLookup(categories);

    const expenseCol = db.collection('expenses');
    for await (const doc of expenseCol.find({})) {
        stats.expenses.scanned++;
        const result = await processDocument({
            collection: 'expenses',
            doc: doc as Document,
            type: 'expense',
            lookup,
            dryRun,
            stats,
            coll: expenseCol,
        });
        if (result === 'updated') stats.expenses.updated++;
        else if (result === 'alreadyOk') stats.expenses.alreadyOk++;
        else stats.expenses.skipped++;
    }

    const incomeCol = db.collection('incomes');
    for await (const doc of incomeCol.find({})) {
        stats.incomes.scanned++;
        const result = await processDocument({
            collection: 'incomes',
            doc: doc as Document,
            type: 'income',
            lookup,
            dryRun,
            stats,
            coll: incomeCol,
        });
        if (result === 'updated') stats.incomes.updated++;
        else if (result === 'alreadyOk') stats.incomes.alreadyOk++;
        else stats.incomes.skipped++;
    }

    const rulesCol = db.collection('autoAccountingRules');
    for await (const doc of rulesCol.find({})) {
        stats.autoAccountingRules.scanned++;
        const ruleType = doc.ruleType === 'income' ? 'income' : 'expense';
        const result = await processDocument({
            collection: 'autoAccountingRules',
            doc: doc as Document,
            type: ruleType,
            lookup,
            dryRun,
            stats,
            coll: rulesCol,
        });
        if (result === 'updated') stats.autoAccountingRules.updated++;
        else if (result === 'alreadyOk') stats.autoAccountingRules.alreadyOk++;
        else stats.autoAccountingRules.skipped++;
    }

    return stats;
}

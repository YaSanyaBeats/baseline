import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { AccountancyCategoryType } from './types';

export type NormalizedTransactionCategory = {
    categoryId: string | null;
    category: string;
};

/**
 * Нормализует categoryId + category при сохранении транзакции.
 * Приоритет — categoryId; имя подтягивается из справочника.
 */
export async function normalizeTransactionCategoryFields(
    db: Db,
    type: AccountancyCategoryType,
    input: { categoryId?: string | null; category?: string | null },
): Promise<{ ok: true; data: NormalizedTransactionCategory } | { ok: false; message: string }> {
    const categoryIdRaw =
        input.categoryId != null && String(input.categoryId).trim() !== ''
            ? String(input.categoryId).trim()
            : '';

    if (categoryIdRaw) {
        let oid: ObjectId;
        try {
            oid = new ObjectId(categoryIdRaw);
        } catch {
            return { ok: false, message: 'Некорректный ID категории' };
        }
        const cat = await db.collection('accountancyCategories').findOne({ _id: oid, type });
        if (!cat) {
            return { ok: false, message: 'Категория не найдена' };
        }
        return {
            ok: true,
            data: { categoryId: categoryIdRaw, category: String(cat.name ?? '').trim() },
        };
    }

    const name = String(input.category ?? '').trim();
    if (!name) {
        return { ok: false, message: 'Категория не указана' };
    }

    const matches = await db
        .collection('accountancyCategories')
        .find({ type, name })
        .toArray();
    if (matches.length === 1) {
        return {
            ok: true,
            data: { categoryId: matches[0]._id.toString(), category: name },
        };
    }

    return { ok: true, data: { categoryId: null, category: name } };
}

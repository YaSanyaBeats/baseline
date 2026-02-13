import { AccountancyCategory, AccountancyCategoryType } from './types';

export interface CategorySelectItem {
    id: string;
    name: string;
    depth: number;
}

/**
 * Строит плоский список категорий с учётом иерархии (parentId) для отображения в Select.
 * Дочерние категории идут после родительских с отступом по depth.
 */
export function buildCategoriesForSelect(
    categories: AccountancyCategory[],
    type: AccountancyCategoryType,
    options?: { excludeIds?: string[] }
): CategorySelectItem[] {
    const filtered = categories.filter((c) => c.type === type);
    const toExclude = new Set(options?.excludeIds ?? []);
    const filtered2 = filtered.filter((c) => c._id && !toExclude.has(c._id));

    const byParent = new Map<string | null, AccountancyCategory[]>();
    for (const c of filtered2) {
        const pid = c.parentId ?? null;
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid)!.push(c);
    }
    for (const arr of byParent.values()) {
        arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    const result: CategorySelectItem[] = [];
    function build(parentId: string | null, depth: number) {
        const children = byParent.get(parentId) ?? [];
        for (const c of children) {
            if (!c._id) continue;
            result.push({ id: c._id, name: c.name, depth });
            build(c._id, depth + 1);
        }
    }
    build(null, 0);
    return result;
}

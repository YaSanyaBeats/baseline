/**
 * Подгруппы операций «Без брони» по полю noBookingSubgroupId категории (accountancyCategories).
 */

import { isExcludedFromAccountancyRoomStatsSumByCategoryId } from '@/lib/accountancyCategoryIds';
import { getNoBookingSubgroupCategoryOrder } from '@/lib/accountancyOperationGroupCategoryOrder';
import type { AccountancyCategory, NoBookingSubgroupId } from '@/lib/types';

export type { NoBookingSubgroupId };

export const NO_BOOKING_SUBGROUP_ORDER = [
    'common',
    'guest',
    'hc',
    'owner',
    'mutual',
    'other',
] as const satisfies readonly NoBookingSubgroupId[];

/** Значения для Select «Привязка к группе» (без «Прочее» — это fallback). */
export const NO_BOOKING_SUBGROUP_BINDABLE = [
    'common',
    'guest',
    'hc',
    'owner',
    'mutual',
] as const satisfies readonly Exclude<NoBookingSubgroupId, 'other'>[];

function findCategoryForTransaction(
    categoryId: string | null | undefined,
    categoryName: string | null | undefined,
    categories: readonly AccountancyCategory[],
): AccountancyCategory | undefined {
    const id = (categoryId ?? '').trim();
    if (id) {
        const byId = categories.find((c) => c._id === id);
        if (byId) return byId;
    }
    const name = (categoryName ?? '').trim();
    if (name) {
        return categories.find((c) => c.name === name);
    }
    return undefined;
}

function resolveSubgroupFromCategoryOrder(categoryName: string): NoBookingSubgroupId | null {
    const name = categoryName.trim();
    if (!name) return null;
    for (const sid of NO_BOOKING_SUBGROUP_ORDER) {
        if (sid === 'other') continue;
        if ((getNoBookingSubgroupCategoryOrder(sid) as readonly string[]).includes(name)) {
            return sid;
        }
    }
    return null;
}

/**
 * Подгруппа «Без брони» для транзакции по полю noBookingSubgroupId категории; иначе «Прочее».
 */
export function resolveNoBookingSubgroupForTransaction(
    categoryId: string | null | undefined,
    categoryName: string | null | undefined,
    categories: readonly AccountancyCategory[],
): NoBookingSubgroupId {
    const cat = findCategoryForTransaction(categoryId, categoryName, categories);
    if (cat != null && Object.prototype.hasOwnProperty.call(cat, 'noBookingSubgroupId')) {
        const subgroup = cat.noBookingSubgroupId ?? 'other';
        if (subgroup !== 'other') return subgroup;
    }
    if (cat?.name) {
        const fromOrder = resolveSubgroupFromCategoryOrder(cat.name);
        if (fromOrder) return fromOrder;
    }
    return 'other';
}

/**
 * Исключение из суммы баланса по комнате (взаиморасчёты владельца, остатки на начало).
 * @param ledgerMonth зарезервирован для совместимости вызовов
 */
export function isExcludedFromAccountancyRoomStatsSum(
    categoryId: string | null | undefined,
    _ledgerMonth?: string | null,
): boolean {
    return isExcludedFromAccountancyRoomStatsSumByCategoryId(categoryId);
}

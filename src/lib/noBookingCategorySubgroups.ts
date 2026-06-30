/**
 * Подгруппы операций «Без брони» по полю noBookingSubgroupId категории (accountancyCategories).
 */

import { getNoBookingSubgroupCategoryOrder } from '@/lib/accountancyOperationGroupCategoryOrder';
import {
    OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_NAME,
    OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_NAME,
    OWNER_PAYOUT_TO_OWNER_CATEGORY_NAME,
    OWNER_TARGETED_INCOME_FROM_OWNER_CATEGORY_NAME,
} from '@/lib/ownerBalanceCategories';
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
    const fromOrder = resolveSubgroupFromCategoryOrder((categoryName ?? '').trim());
    if (fromOrder) return fromOrder;
    return 'other';
}

/** Не входят в общий баланс комнаты (ни в период, ни в накопление «остатка на начало»). */
const ACCOUNTANCY_ROOM_STATS_ALWAYS_EXCLUDED_CATEGORIES = new Set([
    OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_NAME,
    OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_NAME,
    OWNER_PAYOUT_TO_OWNER_CATEGORY_NAME,
    OWNER_TARGETED_INCOME_FROM_OWNER_CATEGORY_NAME,
]);

/**
 * Исключение из суммы баланса по комнате (взаиморасчёты владельца, остатки на начало).
 * @param ledgerMonth зарезервирован для совместимости вызовов
 */
export function isExcludedFromAccountancyRoomStatsSum(
    categoryName: string | null | undefined,
    _ledgerMonth?: string | null,
): boolean {
    const n = (categoryName ?? '').trim();
    if (n === '') return false;
    return ACCOUNTANCY_ROOM_STATS_ALWAYS_EXCLUDED_CATEGORIES.has(n);
}

/**
 * Подгруппы операций «Без брони» по полю noBookingSubgroupId категории (accountancyCategories).
 */

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
        return cat.noBookingSubgroupId ?? 'other';
    }
    return 'other';
}

/** Не входят в суммы таблицы «Баланс по комнатам объекта» за период и в накопление остатка на начало (см. порог месяца ниже). */
const ACCOUNTANCY_ROOM_STATS_EXCLUDED_CATEGORIES = new Set([
    'Выплата владельцу',
    'Остаток на начало (отрицательный)',
    'Остаток на начало (положительный)',
]);

/** YYYY-MM: перечисленные категории исключаются из суммы только для проводок со строго большим месяцем (т.е. с 2026-01). */
export const ACCOUNTANCY_ROOM_STATS_EXCLUSION_AFTER_MONTH = '2025-12';

/**
 * Исключение из суммы баланса по комнате для «Выплата владельцу» и остатков на начало — только после декабря 2025.
 * @param ledgerMonth YYYY-MM как в ledgerMonthFromRecord (отчётный месяц или по дате операции).
 */
export function isExcludedFromAccountancyRoomStatsSum(
    categoryName: string | null | undefined,
    ledgerMonth: string | null | undefined,
): boolean {
    const n = (categoryName ?? '').trim();
    if (n === '' || !ACCOUNTANCY_ROOM_STATS_EXCLUDED_CATEGORIES.has(n)) return false;

    const lm = (ledgerMonth ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(lm)) return false;

    return lm > ACCOUNTANCY_ROOM_STATS_EXCLUSION_AFTER_MONTH;
}

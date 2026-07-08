import { normalizeMongoIdString } from '@/lib/mongoId';
import {
    OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_ID,
    OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_ID,
    OWNER_PAYOUT_TO_OWNER_CATEGORY_ID,
    OWNER_TARGETED_INCOME_FROM_OWNER_CATEGORY_ID,
} from '@/lib/ownerBalanceCategories';

/** Приход «Аренда (баланс/остаток)» — база авто-комиссии на сводке. */
export const MANAGEMENT_COMMISSION_BASE_INCOME_CATEGORY_ID = '6978b557aef81bcff93d2df6';

/** Расход «Комиссия за управление». */
export const MANAGEMENT_COMMISSION_EXPENSE_CATEGORY_ID = '6978b639aef81bcff93d2dfa';

/** Приход «Доля расходов HC». */
export const HOLY_COW_EXPENSE_SHARE_INCOME_CATEGORY_ID = '6989ec3782886b7142faa382';

/** Расход «Комиссия OTA». */
export const OTA_COMMISSION_CATEGORY_ID = '6978b605aef81bcff93d2df8';

/** Альтернативная категория OTA («Комиссия»). */
export const OTA_COMMISSION_ALT_CATEGORY_ID = '698f2d57c4a4c028d74595de';

/** Расход «Комиссия ко-агента». */
export const CO_AGENT_COMMISSION_CATEGORY_ID = '6978b614aef81bcff93d2df9';

export const OTA_COMMISSION_CATEGORY_IDS = new Set([
    OTA_COMMISSION_CATEGORY_ID,
    OTA_COMMISSION_ALT_CATEGORY_ID,
]);

export const CO_AGENT_COMMISSION_CATEGORY_IDS = new Set([CO_AGENT_COMMISSION_CATEGORY_ID]);

/** Не входят в баланс комнаты на сводке бухгалтерии. */
export const ACCOUNTANCY_ROOM_STATS_EXCLUDED_CATEGORY_IDS = new Set([
    OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_ID,
    OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_ID,
    OWNER_PAYOUT_TO_OWNER_CATEGORY_ID,
    OWNER_TARGETED_INCOME_FROM_OWNER_CATEGORY_ID,
]);

/** Исключаются из базы подтранзакций Holy Cow / owner view. */
export const EXCLUDED_COMMISSION_CALC_EXPENSE_CATEGORY_IDS = new Set([
    MANAGEMENT_COMMISSION_EXPENSE_CATEGORY_ID,
    HOLY_COW_EXPENSE_SHARE_INCOME_CATEGORY_ID,
]);

export function normalizeAccountancyCategoryId(id: unknown): string {
    return normalizeMongoIdString(id).trim();
}

export function isExcludedFromAccountancyRoomStatsSumByCategoryId(categoryId: unknown): boolean {
    const id = normalizeAccountancyCategoryId(categoryId);
    return id !== '' && ACCOUNTANCY_ROOM_STATS_EXCLUDED_CATEGORY_IDS.has(id);
}

export function isManagementCommissionBaseIncomeCategoryId(categoryId: unknown): boolean {
    return normalizeAccountancyCategoryId(categoryId) === MANAGEMENT_COMMISSION_BASE_INCOME_CATEGORY_ID;
}

export function isOtaCommissionCategoryId(categoryId: unknown): boolean {
    const id = normalizeAccountancyCategoryId(categoryId);
    return id !== '' && OTA_COMMISSION_CATEGORY_IDS.has(id);
}

export function isCoAgentCommissionCategoryId(categoryId: unknown): boolean {
    const id = normalizeAccountancyCategoryId(categoryId);
    return id !== '' && CO_AGENT_COMMISSION_CATEGORY_IDS.has(id);
}

export function isOtaOrCoAgentCategoryId(categoryId: unknown): boolean {
    return isOtaCommissionCategoryId(categoryId) || isCoAgentCommissionCategoryId(categoryId);
}

export function isHolyCowExpenseShareIncomeCategoryId(categoryId: unknown): boolean {
    return normalizeAccountancyCategoryId(categoryId) === HOLY_COW_EXPENSE_SHARE_INCOME_CATEGORY_ID;
}

export function isExcludedCommissionCalcExpenseCategoryId(categoryId: unknown): boolean {
    const id = normalizeAccountancyCategoryId(categoryId);
    return id !== '' && EXCLUDED_COMMISSION_CALC_EXPENSE_CATEGORY_IDS.has(id);
}

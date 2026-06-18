import {
    resolveCategoryName,
    type CategoryRecordRef,
} from '@/lib/accountancyCategoryResolve';
import { normalizeMongoIdString } from '@/lib/mongoId';

/** «Списано со счета владельца» — accountancyCategories. */
export const OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_ID = '69fcb73bd160e819981f6e8c';

/** «Начислено владельцу» — accountancyCategories. */
export const OWNER_ACCRUED_TO_OWNER_CATEGORY_ID = '69fb4611d160e819981f6d19';

/** «Выплата владельцу» — accountancyCategories. */
export const OWNER_PAYOUT_TO_OWNER_CATEGORY_ID = '6978c110aef81bcff93d2e18';

/** «Остаток на начало (положительный)» — accountancyCategories. */
export const OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_ID = '698324adaef81bcff93e8e6f';

/** «Остаток на начало (отрицательный)» — accountancyCategories. */
export const OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_ID = '698324baaef81bcff93e8e70';

export const OWNER_BALANCE_CATEGORY_IDS = new Set([
    OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_ID,
    OWNER_ACCRUED_TO_OWNER_CATEGORY_ID,
    OWNER_PAYOUT_TO_OWNER_CATEGORY_ID,
    OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_ID,
    OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_ID,
]);

/** Канонические названия категорий (как в MongoDB). */
export const OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_NAME = 'Списано со счета владельца';
export const OWNER_ACCRUED_TO_OWNER_CATEGORY_NAME = 'Начислено владельцу';
export const OWNER_PAYOUT_TO_OWNER_CATEGORY_NAME = 'Выплата владельцу';
export const OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_NAME = 'Остаток на начало (положительный)';
export const OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_NAME = 'Остаток на начало (отрицательный)';

export const OWNER_VIEW_SETTLEMENT_CATEGORY_ORDER = [
    OWNER_PAYOUT_TO_OWNER_CATEGORY_NAME,
    OWNER_ACCRUED_TO_OWNER_CATEGORY_NAME,
    OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_NAME,
    OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_NAME,
    OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_NAME,
] as const;

const CANONICAL_NAME_BY_ID: Record<string, string> = {
    [OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_ID]: OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_NAME,
    [OWNER_ACCRUED_TO_OWNER_CATEGORY_ID]: OWNER_ACCRUED_TO_OWNER_CATEGORY_NAME,
    [OWNER_PAYOUT_TO_OWNER_CATEGORY_ID]: OWNER_PAYOUT_TO_OWNER_CATEGORY_NAME,
    [OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_ID]: OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_NAME,
    [OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_ID]: OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_NAME,
};

function normalizeOwnerBalanceCategoryCompareKey(name: string): string {
    return name.trim().replace(/ё/g, 'е').toLowerCase();
}

const CANONICAL_NAME_BY_COMPARE_KEY: Record<string, string> = {
    [normalizeOwnerBalanceCategoryCompareKey(OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_NAME)]:
        OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_NAME,
    [normalizeOwnerBalanceCategoryCompareKey(OWNER_ACCRUED_TO_OWNER_CATEGORY_NAME)]:
        OWNER_ACCRUED_TO_OWNER_CATEGORY_NAME,
    [normalizeOwnerBalanceCategoryCompareKey(OWNER_PAYOUT_TO_OWNER_CATEGORY_NAME)]:
        OWNER_PAYOUT_TO_OWNER_CATEGORY_NAME,
    [normalizeOwnerBalanceCategoryCompareKey(OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_NAME)]:
        OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_NAME,
    [normalizeOwnerBalanceCategoryCompareKey(OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_NAME)]:
        OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_NAME,
};

export type OwnerBalanceCategoryKind =
    | 'payout'
    | 'accrued'
    | 'debited'
    | 'openingPositive'
    | 'openingNegative';

export function ownerBalanceCategoryKind(category: string): OwnerBalanceCategoryKind | null {
    const canonical = CANONICAL_NAME_BY_COMPARE_KEY[normalizeOwnerBalanceCategoryCompareKey(category)];
    if (!canonical) return null;
    switch (canonical) {
        case OWNER_PAYOUT_TO_OWNER_CATEGORY_NAME:
            return 'payout';
        case OWNER_ACCRUED_TO_OWNER_CATEGORY_NAME:
            return 'accrued';
        case OWNER_DEBITED_FROM_ACCOUNT_CATEGORY_NAME:
            return 'debited';
        case OWNER_OPENING_BALANCE_POSITIVE_CATEGORY_NAME:
            return 'openingPositive';
        case OWNER_OPENING_BALANCE_NEGATIVE_CATEGORY_NAME:
            return 'openingNegative';
        default:
            return null;
    }
}

export function resolveOwnerBalanceCanonicalCategoryName(
    record: CategoryRecordRef,
    nameById: Map<string, string>
): string | null {
    const id = record.categoryId != null ? normalizeMongoIdString(record.categoryId).trim() : '';
    if (id && CANONICAL_NAME_BY_ID[id]) return CANONICAL_NAME_BY_ID[id];

    const resolved = resolveCategoryName(record, nameById);
    return CANONICAL_NAME_BY_COMPARE_KEY[normalizeOwnerBalanceCategoryCompareKey(resolved)] ?? null;
}

export function isOwnerBalanceCategory(
    record: CategoryRecordRef,
    nameById: Map<string, string>
): boolean {
    return resolveOwnerBalanceCanonicalCategoryName(record, nameById) != null;
}

export function isOwnerBalanceCategoryName(name: string): boolean {
    return ownerBalanceCategoryKind(name) != null;
}

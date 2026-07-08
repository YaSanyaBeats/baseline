import type { AccountancyCategory, CategoryDuplicateRule } from '@/lib/types';

export const CATEGORY_DUPLICATE_RULES: CategoryDuplicateRule[] = ['off', 'per_period', 'per_booking'];

export function resolveCategoryDuplicateRule(
    category: Pick<AccountancyCategory, 'duplicateRule' | 'forbidDuplicates'> | null | undefined,
): CategoryDuplicateRule {
    const rule = category?.duplicateRule;
    if (rule === 'off' || rule === 'per_period' || rule === 'per_booking') return rule;
    return category?.forbidDuplicates ? 'per_period' : 'off';
}

export function isValidCategoryDuplicateRule(value: unknown): value is CategoryDuplicateRule {
    return value === 'off' || value === 'per_period' || value === 'per_booking';
}

/** Синхронизация legacy-поля forbidDuplicates. */
export function legacyForbidDuplicatesFromRule(rule: CategoryDuplicateRule): boolean {
    return rule === 'per_period';
}

export function duplicateRuleBlockedMessage(rule: CategoryDuplicateRule): string {
    if (rule === 'per_booking') {
        return 'Для этой категории включён запрет дублей: уже есть запись с тем же объектом, комнатой, категорией и бронированием.';
    }
    return 'Для этой категории включён запрет дублей: уже есть запись с тем же объектом, комнатой, категорией и отчётным месяцем.';
}

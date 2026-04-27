import type { NoBookingSubgroupId } from '@/lib/noBookingCategorySubgroups';

/**
 * Порядок категорий в группах «Бронь 1 / Бронь 2» (см. accountancy).
 * Имена — как в MongoDB (коллекция accountancyCategories).
 * 1) Аренда + 2) WP 3) Стирка 4) Уборка 5) OTA/агент 6) комиссия HC
 */
export const BOOKING_GROUP_CATEGORY_ORDER = [
    'Аренда (баланс/остаток)',
    'Аренда (депозит)',
    'Аренда (предоплата)',
    'Аренда',
    'Welcome Pack',
    'Welcome Pack (Studio, 1BR)',
    'Welcome Pack (2BR)',
    'Welcome Pack (3-4BR)',
    'Welcome Pack (Villa)',
    'Стирка',
    'Стирка 2BR',
    'Стирка 3BR',
    'Стирка 4BR',
    'Аренда белья',
    'Уборка',
    'Уборка генеральная',
    'Уборка (без категории)',
    'Уборка чек-ин (1СП / Студия)',
    'Уборка чек-ин (2СП апарт)',
    'Уборка чек-ин (2СП вилла)',
    'Уборка чек-ин (3СП вилла)',
    'Уборка чек-ин (4СП вилла)',
    'Комиссия OTA',
    'Комиссия ко-агента',
    'Комиссия за управление',
    'Доля расходов Holy Cow Phuket',
    'Комиссия',
] as const;

/** 3. Общие расходы */
export const NO_BOOKING_COMMON_CATEGORY_ORDER = [
    'Коммунальные (электричество)',
    'Коммунальные (вода)',
    'Коммунальные (интернет)',
    'Услуги подрядчика (чистка A/С)',
    'Коммунальные',
] as const;

/** 4. Расходы гостя */
export const NO_BOOKING_GUEST_CATEGORY_ORDER = [
    'Коммунальные, платит гость (электричество + вода)',
    'Коммунальные, платит гость (интернет)',
    'Компенсация ущерба',
] as const;

/** 5. Расходы HC */
export const NO_BOOKING_HC_CATEGORY_ORDER = ['Доля расходов Holy Cow Phuket'] as const;

/** 6. Расходы владельца */
export const NO_BOOKING_OWNER_CATEGORY_ORDER = [
    'Baseline Premium',
    'CAM-fee',
    'Налог на недвижимость',
    'Налоги (компания)',
    'Ремонт (материалы)',
    'Ремонт (работа)',
    'Обслуживание и ремонт',
    'Услуги подрядчика (инженер/ремонт)',
    'Услуги подрядчика (ремонт A/С)',
    'Закупка принадлежностей',
    'Техника/мебель',
    'Оборудование (компания)',
    'Закупка оборудования, платит гость',
    'Постельное белье (комплект)',
    'Комиссия ремонт/закупки',
    'Химчистка дивана',
    'Химчистка штор',
    'Прочие расходы (вне категории)',
] as const;

/** 7. Взаиморасчёты */
export const NO_BOOKING_MUTUAL_CATEGORY_ORDER = [
    'Выплата владельцу',
    'Приход от владельца целевой',
    'Остаток на начало (положительный)',
    'Остаток на начало (отрицательный)',
] as const;

export function getNoBookingSubgroupCategoryOrder(
    sid: NoBookingSubgroupId,
): readonly string[] {
    switch (sid) {
        case 'common':
            return NO_BOOKING_COMMON_CATEGORY_ORDER;
        case 'guest':
            return NO_BOOKING_GUEST_CATEGORY_ORDER;
        case 'hc':
            return NO_BOOKING_HC_CATEGORY_ORDER;
        case 'owner':
            return NO_BOOKING_OWNER_CATEGORY_ORDER;
        case 'mutual':
            return NO_BOOKING_MUTUAL_CATEGORY_ORDER;
        case 'other':
            return [];
    }
}

export interface RowWithCategoryAndDate {
    category: string;
    date: string | Date;
}

/**
 * Сначала по позиции категории в `order` (не из списка — в конце группы),
 * внутри одной «ступени» — по дате по убыванию.
 */
export function sortRowsByAccountancyCategoryOrder<T extends RowWithCategoryAndDate>(
    rows: T[],
    order: readonly string[],
): void {
    const afterListed = order.length;
    rows.sort((a, b) => {
        const nameA = (a.category ?? '').trim();
        const nameB = (b.category ?? '').trim();
        const idxA = order.indexOf(nameA);
        const idxB = order.indexOf(nameB);
        const ra = idxA === -1 ? afterListed : idxA;
        const rb = idxB === -1 ? afterListed : idxB;
        if (ra !== rb) return ra - rb;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
}

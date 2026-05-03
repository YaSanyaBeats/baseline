/**
 * Подгруппы операций «Без брони» по категории проводки.
 * Имена категорий — как в MongoDB (коллекция accountancyCategories), см. сопоставление с запросом к БД.
 */

export const NO_BOOKING_SUBGROUP_ORDER = [
    'common',
    'guest',
    'hc',
    'owner',
    'mutual',
    'other',
] as const;

export type NoBookingSubgroupId = (typeof NO_BOOKING_SUBGROUP_ORDER)[number];

/** Категория (точное имя) → подгруппа. Порядок объявления не важен: совпадение по полному имени. */
const CATEGORY_TO_SUBGROUP = (() => {
    const m = new Map<string, NoBookingSubgroupId>();

    const add = (names: string[], id: NoBookingSubgroupId) => {
        for (const n of names) m.set(n, id);
    };

    add(
        [
            'Коммунальные (электричество)',
            'Коммунальные (вода)',
            'Коммунальные (интернет)',
            'Услуги подрядчика (чистка A/С)',
            'Коммунальные',
        ],
        'common',
    );

    add(
        [
            'Коммунальные, платит гость (электричество + вода)',
            'Коммунальные, платит гость (интернет)',
            'Компенсация ущерба',
        ],
        'guest',
    );

    add(['Доля расходов Holy Cow Phuket'], 'hc');

    add(
        [
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
        ],
        'owner',
    );

    add(
        [
            'Выплата владельцу',
            'Приход от владельца целевой',
            'Остаток на начало (отрицательный)',
            'Остаток на начало (положительный)',
        ],
        'mutual',
    );

    return m;
})();

export function resolveNoBookingSubgroupId(categoryName: string | null | undefined): NoBookingSubgroupId {
    const name = (categoryName ?? '').trim();
    if (!name) return 'other';
    return CATEGORY_TO_SUBGROUP.get(name) ?? 'other';
}

/** Не входят в суммы таблицы «Баланс по комнатам объекта» за период и в накопление остатка на начало. */
const ACCOUNTANCY_ROOM_STATS_EXCLUDED_CATEGORIES = new Set([
    'Выплата владельцу',
    'Остаток на начало (отрицательный)',
    'Остаток на начало (положительный)',
]);

export function isExcludedFromAccountancyRoomStatsSum(categoryName: string | null | undefined): boolean {
    const n = (categoryName ?? '').trim();
    return n !== '' && ACCOUNTANCY_ROOM_STATS_EXCLUDED_CATEGORIES.has(n);
}

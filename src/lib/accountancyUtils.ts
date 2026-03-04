import type {
    Expense,
    Income,
    CashflowRule,
    CashflowRuleFilter,
    CashflowRuleCompareOperator,
} from './types';

/** Сумма по расходу: количество × стоимость (для старых записей quantity = 1). */
export function getExpenseSum(e: Expense): number {
    return (e.quantity ?? 1) * (e.amount ?? 0);
}

/** Сумма по доходу: количество × стоимость (для старых записей quantity = 1). */
export function getIncomeSum(i: Income): number {
    return (i.quantity ?? 1) * (i.amount ?? 0);
}

/** Комната с метаданными для правил */
export interface RoomWithMeta {
    id: number;
    name?: string;
    bedrooms?: number;
    bathrooms?: number;
    livingRoomSofas?: number;
    kitchen?: string;
    level?: string;
    commissionSchemeId?: number;
    internetCostPerMonth?: number;
}

/** Объект с метаданными и комнатами для применения правил */
export interface ObjectWithMeta {
    id: number;
    name?: string;
    district?: string;
    objectType?: string;
    roomTypes?: RoomWithMeta[];
}

/** Бронь с датами для фильтра по датам брони */
export interface BookingForRule {
    id: number;
    arrival: string;
    departure: string;
}

/** Контекст для применения правил */
export interface RuleMatchContext {
    objectsMap: Map<number, ObjectWithMeta>;
    bookingsMap?: Map<number, BookingForRule>;
}

function compareNumber(
    op: CashflowRuleCompareOperator | undefined,
    actual: number,
    value?: number,
    valueTo?: number
): boolean {
    if (op === undefined || value === undefined) return false;
    const v = Number(value);
    const vTo = valueTo !== undefined ? Number(valueTo) : undefined;
    switch (op) {
        case 'eq':
            return actual === v;
        case 'ne':
            return actual !== v;
        case 'gt':
            return actual > v;
        case 'gte':
            return actual >= v;
        case 'lt':
            return actual < v;
        case 'lte':
            return actual <= v;
        case 'between':
            return vTo !== undefined && actual >= v && actual <= vTo;
        default:
            return false;
    }
}

function compareDate(
    op: CashflowRuleCompareOperator | undefined,
    actualDateStr: string,
    value?: string,
    valueTo?: string
): boolean {
    if (op === undefined || value === undefined) return false;
    const a = new Date(actualDateStr).getTime();
    const v = new Date(value).getTime();
    const vTo = valueTo !== undefined ? new Date(valueTo).getTime() : undefined;
    switch (op) {
        case 'eq':
            return a === v;
        case 'ne':
            return a !== v;
        case 'gt':
        case 'after':
            return a > v;
        case 'gte':
            return a >= v;
        case 'lt':
        case 'before':
            return a < v;
        case 'lte':
            return a <= v;
        case 'between':
            return vTo !== undefined && a >= v && a <= vTo;
        default:
            return false;
    }
}

/**
 * Проверяет, подходит ли расход под один фильтр.
 */
function expenseMatchesFilter(
    expense: Expense,
    filter: CashflowRuleFilter,
    ctx: RuleMatchContext
): boolean {
    const { objectsMap, bookingsMap } = ctx;

    switch (filter.type) {
        case 'rooms': {
            if (!filter.roomLinks?.length) return false;
            const roomId = expense.roomId ?? 0;
            return filter.roomLinks.some(
                (link) => link.id === expense.objectId && link.rooms.includes(roomId)
            );
        }
        case 'metadata': {
            if (!filter.metadataField || filter.metadataValue === undefined) return false;
            const obj = objectsMap.get(expense.objectId);
            if (!obj) return false;
            const value =
                filter.metadataField === 'district'
                    ? obj.district
                    : filter.metadataField === 'objectType'
                      ? obj.objectType
                      : undefined;
            return String(value ?? '').toLowerCase() === String(filter.metadataValue ?? '').toLowerCase();
        }
        case 'counterparty': {
            if (!filter.counterpartyId) return false;
            const cpVal = `cp:${filter.counterpartyId}`;
            const src = filter.sourceOrRecipient !== 'recipient' && expense.source === cpVal;
            const rec = filter.sourceOrRecipient !== 'source' && expense.recipient === cpVal;
            if (filter.sourceOrRecipient === 'both') return src || rec;
            if (filter.sourceOrRecipient === 'source') return src;
            return rec;
        }
        case 'category': {
            if (!filter.categoryNames?.length) return false;
            const cat = String(expense.category ?? '').trim().toLowerCase();
            return filter.categoryNames.some(
                (c) => String(c ?? '').trim().toLowerCase() === cat
            );
        }
        case 'roomMetadata': {
            if (!filter.roomMetadataField || filter.roomMetadataValue === undefined) return false;
            const obj = objectsMap.get(expense.objectId);
            const roomId = expense.roomId;
            if (!obj?.roomTypes?.length || roomId == null) return false;
            const room = obj.roomTypes.find((r) => r.id === roomId);
            if (!room) return false;
            const raw =
                filter.roomMetadataField === 'bedrooms'
                    ? room.bedrooms
                    : filter.roomMetadataField === 'bathrooms'
                      ? room.bathrooms
                      : filter.roomMetadataField === 'livingRoomSofas'
                        ? room.livingRoomSofas
                        : filter.roomMetadataField === 'kitchen'
                          ? room.kitchen
                          : filter.roomMetadataField === 'level'
                            ? room.level
                            : filter.roomMetadataField === 'commissionSchemeId'
                              ? room.commissionSchemeId
                              : filter.roomMetadataField === 'internetCostPerMonth'
                                ? room.internetCostPerMonth
                                : undefined;
            const actual = typeof raw === 'number' ? raw : typeof raw === 'string' ? raw : undefined;
            if (actual === undefined) return false;
            if (typeof actual === 'number')
                return compareNumber(
                    filter.roomMetadataOperator,
                    actual,
                    Number(filter.roomMetadataValue),
                    filter.roomMetadataValueTo !== undefined ? Number(filter.roomMetadataValueTo) : undefined
                );
            return String(filter.roomMetadataValue).toLowerCase() === String(actual).toLowerCase();
        }
        case 'booking': {
            if (filter.hasBooking !== undefined)
                return (expense.bookingId != null) === filter.hasBooking;
            if (filter.bookingIds?.length)
                return expense.bookingId != null && filter.bookingIds.includes(expense.bookingId);
            return false;
        }
        case 'bookingDate': {
            if (!expense.bookingId || !bookingsMap) return false;
            const booking = bookingsMap.get(expense.bookingId);
            if (!booking) return false;
            const dateStr =
                filter.bookingDateField === 'departure' ? booking.departure : booking.arrival;
            return compareDate(
                filter.bookingDateOperator,
                dateStr,
                filter.bookingDateValue,
                filter.bookingDateValueTo
            );
        }
        case 'recordDate': {
            const d = expense.date instanceof Date ? expense.date.toISOString() : String(expense.date ?? '');
            return compareDate(
                filter.recordDateOperator,
                d,
                filter.recordDateValue,
                filter.recordDateValueTo
            );
        }
        case 'amount': {
            const sum = getExpenseSum(expense);
            return compareNumber(
                filter.amountOperator,
                sum,
                filter.amountValue,
                filter.amountValueTo
            );
        }
        case 'reportMonth': {
            const rm = expense.reportMonth ?? '';
            if (filter.reportMonth) return rm === filter.reportMonth;
            if (filter.reportMonths?.length) return filter.reportMonths.includes(rm);
            return false;
        }
        case 'status': {
            if (!filter.recordStatus) return false;
            return expense.status === filter.recordStatus;
        }
        case 'recordType': {
            if (!filter.recordType) return true;
            return filter.recordType === 'expense';
        }
        default:
            return false;
    }
}

/**
 * Проверяет, подходит ли доход под один фильтр.
 */
function incomeMatchesFilter(
    income: Income,
    filter: CashflowRuleFilter,
    ctx: RuleMatchContext
): boolean {
    const { objectsMap, bookingsMap } = ctx;

    switch (filter.type) {
        case 'rooms': {
            if (!filter.roomLinks?.length) return false;
            const roomId = income.roomId ?? 0;
            return filter.roomLinks.some(
                (link) => link.id === income.objectId && link.rooms.includes(roomId)
            );
        }
        case 'metadata': {
            if (!filter.metadataField || filter.metadataValue === undefined) return false;
            const obj = objectsMap.get(income.objectId);
            if (!obj) return false;
            const value =
                filter.metadataField === 'district'
                    ? obj.district
                    : filter.metadataField === 'objectType'
                      ? obj.objectType
                      : undefined;
            return String(value ?? '').toLowerCase() === String(filter.metadataValue ?? '').toLowerCase();
        }
        case 'counterparty': {
            if (!filter.counterpartyId) return false;
            const cpVal = `cp:${filter.counterpartyId}`;
            const src = filter.sourceOrRecipient !== 'recipient' && income.source === cpVal;
            const rec = filter.sourceOrRecipient !== 'source' && income.recipient === cpVal;
            if (filter.sourceOrRecipient === 'both') return src || rec;
            if (filter.sourceOrRecipient === 'source') return src;
            return rec;
        }
        case 'category': {
            if (!filter.categoryNames?.length) return false;
            const cat = String(income.category ?? '').trim().toLowerCase();
            return filter.categoryNames.some(
                (c) => String(c ?? '').trim().toLowerCase() === cat
            );
        }
        case 'roomMetadata': {
            if (!filter.roomMetadataField || filter.roomMetadataValue === undefined) return false;
            const obj = objectsMap.get(income.objectId);
            const roomId = income.roomId;
            if (!obj?.roomTypes?.length || roomId == null) return false;
            const room = obj.roomTypes.find((r) => r.id === roomId);
            if (!room) return false;
            const raw =
                filter.roomMetadataField === 'bedrooms'
                    ? room.bedrooms
                    : filter.roomMetadataField === 'bathrooms'
                      ? room.bathrooms
                      : filter.roomMetadataField === 'livingRoomSofas'
                        ? room.livingRoomSofas
                        : filter.roomMetadataField === 'kitchen'
                          ? room.kitchen
                          : filter.roomMetadataField === 'level'
                            ? room.level
                            : filter.roomMetadataField === 'commissionSchemeId'
                              ? room.commissionSchemeId
                              : filter.roomMetadataField === 'internetCostPerMonth'
                                ? room.internetCostPerMonth
                                : undefined;
            const actual = typeof raw === 'number' ? raw : typeof raw === 'string' ? raw : undefined;
            if (actual === undefined) return false;
            if (typeof actual === 'number')
                return compareNumber(
                    filter.roomMetadataOperator,
                    actual,
                    Number(filter.roomMetadataValue),
                    filter.roomMetadataValueTo !== undefined ? Number(filter.roomMetadataValueTo) : undefined
                );
            return String(filter.roomMetadataValue).toLowerCase() === String(actual).toLowerCase();
        }
        case 'booking': {
            if (filter.hasBooking !== undefined)
                return (income.bookingId != null) === filter.hasBooking;
            if (filter.bookingIds?.length)
                return income.bookingId != null && filter.bookingIds.includes(income.bookingId);
            return false;
        }
        case 'bookingDate': {
            if (!income.bookingId || !bookingsMap) return false;
            const booking = bookingsMap.get(income.bookingId);
            if (!booking) return false;
            const dateStr =
                filter.bookingDateField === 'departure' ? booking.departure : booking.arrival;
            return compareDate(
                filter.bookingDateOperator,
                dateStr,
                filter.bookingDateValue,
                filter.bookingDateValueTo
            );
        }
        case 'recordDate': {
            const d = income.date instanceof Date ? income.date.toISOString() : String(income.date ?? '');
            return compareDate(
                filter.recordDateOperator,
                d,
                filter.recordDateValue,
                filter.recordDateValueTo
            );
        }
        case 'amount': {
            const sum = getIncomeSum(income);
            return compareNumber(
                filter.amountOperator,
                sum,
                filter.amountValue,
                filter.amountValueTo
            );
        }
        case 'reportMonth': {
            const rm = income.reportMonth ?? '';
            if (filter.reportMonth) return rm === filter.reportMonth;
            if (filter.reportMonths?.length) return filter.reportMonths.includes(rm);
            return false;
        }
        case 'status': {
            if (!filter.recordStatus) return false;
            return income.status === filter.recordStatus;
        }
        case 'recordType': {
            if (!filter.recordType) return true;
            return filter.recordType === 'income';
        }
        default:
            return false;
    }
}

function recordMatchesRule(
    matchFilter: (filter: CashflowRuleFilter) => boolean,
    rule: CashflowRule
): boolean {
    const logic = rule.filterLogic;
    if (!rule.filters?.length) return true;
    if (logic === 'and') {
        return rule.filters.every(matchFilter);
    }
    return rule.filters.some(matchFilter);
}

export interface RuleBalanceResult {
    balance: number;
    /** 'plus' — сумма по модулю, 'minus' — минус сумма по модулю */
    balanceSign: 'plus' | 'minus';
    matchedExpenses: Expense[];
    matchedIncomes: Income[];
}

function getRuleBalanceSign(rule: CashflowRule): 'plus' | 'minus' {
    if (rule.balanceSign === 'plus' || rule.balanceSign === 'minus') return rule.balanceSign;
    return rule.positiveSign === true ? 'plus' : 'minus';
}

/**
 * Подсчёт баланса по правилу: отбирает расходы/доходы по фильтрам (И/ИЛИ).
 * balanceSign 'plus': баланс = |расходы| + |доходы|.
 * balanceSign 'minus': баланс = -(|расходы| + |доходы|).
 * @param bookings — опционально, для фильтров по брони и датам брони
 */
export function getBalanceByRule(
    rule: CashflowRule,
    expenses: Expense[],
    incomes: Income[],
    objects: ObjectWithMeta[],
    bookings?: BookingForRule[]
): RuleBalanceResult {
    const objectsMap = new Map(objects.map((o) => [o.id, o]));
    const bookingsMap =
        bookings?.length ?
            new Map(bookings.map((b) => [b.id, b]))
        : undefined;
    const ctx: RuleMatchContext = { objectsMap, bookingsMap };

    const matchedExpenses = expenses.filter((e) =>
        recordMatchesRule((f) => expenseMatchesFilter(e, f, ctx), rule)
    );
    const matchedIncomes = incomes.filter((i) =>
        recordMatchesRule((f) => incomeMatchesFilter(i, f, ctx), rule)
    );

    const expenseSum = matchedExpenses.reduce((s, e) => s + getExpenseSum(e), 0);
    const incomeSum = matchedIncomes.reduce((s, i) => s + getIncomeSum(i), 0);
    const sign = getRuleBalanceSign(rule);
    const absSum = Math.abs(expenseSum) + Math.abs(incomeSum);
    const balance = sign === 'plus' ? absSum : -absSum;

    return {
        balance,
        balanceSign: sign,
        matchedExpenses,
        matchedIncomes,
    };
}


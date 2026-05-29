import type {
    Expense,
    Income,
    CashflowRule,
    CashflowRuleFilter,
    CashflowRuleCompareOperator,
} from './types';
import { normalizeMongoIdString } from './mongoId';
import { resolveCategoryName } from './accountancyCategoryResolve';

export type AccountancyParentTransactionRef = {
    id: string;
    type: 'expense' | 'income';
    label: string;
};

/** ID и тип родительской транзакции (если запись — подтранзакция). */
export function getParentTransactionPointer(
    record: Expense | Income,
): { id: string; type: 'expense' | 'income' } | null {
    const parentExpenseId =
        record.parentExpenseId != null ? normalizeMongoIdString(record.parentExpenseId).trim() : '';
    const parentIncomeId =
        record.parentIncomeId != null ? normalizeMongoIdString(record.parentIncomeId).trim() : '';
    if (parentExpenseId) return { id: parentExpenseId, type: 'expense' };
    if (parentIncomeId) return { id: parentIncomeId, type: 'income' };
    return null;
}

export function formatAccountancyTransactionLabel(
    record: Expense | Income,
    type: 'expense' | 'income',
    expenseTypeLabel: string,
    incomeTypeLabel: string,
    nameById?: Map<string, string>,
): string {
    const categoryLabel = nameById ? resolveCategoryName(record, nameById) : (record.category ?? '');
    const total = ((record.quantity ?? 1) * (record.amount ?? 0)).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const typeLabel = type === 'expense' ? expenseTypeLabel : incomeTypeLabel;
    return `${typeLabel}: ${categoryLabel} - ${total}`;
}

export function resolveAccountancyParentTransactionRef(
    record: Expense | Income,
    transactionById: Map<string, { type: 'expense' | 'income'; record: Expense | Income }>,
    expenseTypeLabel: string,
    incomeTypeLabel: string,
    nameById?: Map<string, string>,
): AccountancyParentTransactionRef | undefined {
    const pointer = getParentTransactionPointer(record);
    if (!pointer) return undefined;
    const found = transactionById.get(pointer.id);
    if (found) {
        return {
            id: pointer.id,
            type: pointer.type,
            label: formatAccountancyTransactionLabel(
                found.record,
                found.type,
                expenseTypeLabel,
                incomeTypeLabel,
                nameById,
            ),
        };
    }
    const typeLabel = pointer.type === 'expense' ? expenseTypeLabel : incomeTypeLabel;
    return {
        id: pointer.id,
        type: pointer.type,
        label: typeLabel,
    };
}

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
    internetProviderCounterpartyId?: string;
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

function recordRoomMatchesCashflowLinks(
    objectId: number,
    roomName: string | null | undefined,
    roomLinks: { id: number; rooms: (string | number)[] }[] | undefined,
    obj: ObjectWithMeta | undefined
): boolean {
    if (!roomLinks?.length) return false;
    const name = (roomName ?? '').trim();
    if (!name) return false;
    return roomLinks.some((link) => {
        if (link.id !== objectId) return false;
        return link.rooms.some((x) => {
            if (typeof x === 'string') return x.trim() === name;
            if (typeof x === 'number' && obj?.roomTypes) {
                const unit = obj.roomTypes.find((r) => r.id === x);
                const un = unit?.name != null ? String(unit.name).trim() : '';
                return un === name;
            }
            return false;
        });
    });
}

function findRoomMetaRow(
    obj: ObjectWithMeta | undefined,
    roomName: string | null | undefined
): RoomWithMeta | undefined {
    const n = (roomName ?? '').trim();
    if (!obj?.roomTypes?.length || !n) return undefined;
    return obj.roomTypes.find((r) => (r.name != null ? String(r.name).trim() : '') === n);
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
            const obj = objectsMap.get(expense.objectId);
            return recordRoomMatchesCashflowLinks(expense.objectId, expense.roomName, filter.roomLinks, obj);
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
            const room = findRoomMetaRow(obj, expense.roomName);
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
                                : filter.roomMetadataField === 'internetProviderCounterpartyId'
                                  ? room.internetProviderCounterpartyId
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
            const obj = objectsMap.get(income.objectId);
            return recordRoomMatchesCashflowLinks(income.objectId, income.roomName, filter.roomLinks, obj);
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
            const room = findRoomMetaRow(obj, income.roomName);
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
                                : filter.roomMetadataField === 'internetProviderCounterpartyId'
                                  ? room.internetProviderCounterpartyId
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

/** Нормализует ввод стоимости: пробелы, запятая как десятичный разделитель. */
export function sanitizeDecimalTyping(raw: string): string {
    let s = raw.replace(/\s/g, '').replace(/,/g, '.');
    s = s.replace(/[^\d.]/g, '');
    const dotIdx = s.indexOf('.');
    if (dotIdx !== -1) {
        s = s.slice(0, dotIdx + 1) + s.slice(dotIdx + 1).replace(/\./g, '');
    }
    return s;
}

/** Парсинг стоимости из поля ввода (пробелы, запятая или точка как разделитель дробной части). */
export function parseDecimalInput(raw: string): number | null {
    const t = sanitizeDecimalTyping(raw);
    if (t === '' || t === '.') return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}

export function getAmountFieldDisplayValue(
    amount: number | undefined,
    amountInput: string | undefined,
): string {
    if (amountInput !== undefined) return amountInput;
    return amount != null ? String(amount) : '';
}

/** При редактировании: нельзя обнулить ранее ненулевую единичную стоимость; нулевая может остаться нулевой. */
export function isForbiddenZeroUnitAmountOnEdit(
    previousUnitAmount: number | null | undefined,
    newUnitAmount: number | null | undefined,
): boolean {
    const prev = Number(previousUnitAmount ?? 0);
    const next = Number(newUnitAmount ?? 0);
    if (next > 0) return false;
    return prev > 0;
}


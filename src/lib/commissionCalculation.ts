/**
 * Расчёт комиссии по различным схемам.
 * Использует привязанные доходы и расходы к бронированиям.
 */

import { Booking, Expense, Income, AccountancyCategory } from './types';
import type { CategoryDivisibility } from './types';

export type CommissionSchemeId = 1 | 2 | 3 | 4;

/** Маппинг: название категории → делимость. /2 и /3 = делимый, иначе нет. */
export type CategoryDivisibilityMap = Record<string, CategoryDivisibility | undefined>;

/** Ключевые слова для OTA и ко-агента (схемы 2–4) */
const CATEGORY_KEYWORDS = {
    otaCommission: ['ota', 'commission ota', 'комиссия ota', 'ota commission'],
    coAgentCommission: ['co-agent', 'coagent', 'ко-агент', 'коагент', 'co-agents', 'co-agents commission'],
} as const;

function categoryMatches(categoryName: string, keywords: readonly string[]): boolean {
    const lower = categoryName.toLowerCase().trim();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/** Проверка: категория — комиссия OTA */
export function isOtaCommission(categoryName: string): boolean {
    return categoryMatches(categoryName, CATEGORY_KEYWORDS.otaCommission);
}

/** Проверка: категория — комиссия ко-агента */
export function isCoAgentCommission(categoryName: string): boolean {
    return categoryMatches(categoryName, CATEGORY_KEYWORDS.coAgentCommission);
}

/** Проверка: OTA или ко-агент (для схем 2, 3, 4) */
export function isOtaOrCoAgent(categoryName: string): boolean {
    return isOtaCommission(categoryName) || isCoAgentCommission(categoryName);
}

/** Проверка: расход делимый по divisibility категории (/2 или /3) */
export function isDivisibleByCategory(divisibility: CategoryDivisibility | undefined): boolean {
    return divisibility === '/2' || divisibility === '/3';
}

/** Расчёт количества ночей между датами */
export function getNightsCount(arrival: string | Date | undefined, departure: string | Date | undefined): number {
    const a = arrival ? new Date(arrival) : new Date(NaN);
    const d = departure ? new Date(departure) : new Date(NaN);
    const aTime = a.getTime();
    const dTime = d.getTime();
    if (Number.isNaN(aTime) || Number.isNaN(dTime)) return 0;
    const diff = dTime - aTime;
    const nights = Math.ceil(diff / (24 * 60 * 60 * 1000));
    return Number.isNaN(nights) ? 0 : Math.max(0, nights);
}

/** Проверка, пересекается ли бронирование с месяцем YYYY-MM */
export function bookingOverlapsMonth(
    arrival: string | Date,
    departure: string | Date,
    monthKey: string
): boolean {
    const [y, m] = monthKey.split('-').map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0, 23, 59, 59);
    const arr = new Date(arrival);
    const dep = new Date(departure);
    return arr <= monthEnd && dep >= monthStart;
}

/** Количество ночей бронирования, попадающих в месяц */
export function getNightsInMonth(
    arrival: string | Date,
    departure: string | Date,
    monthKey: string
): number {
    const [y, m] = monthKey.split('-').map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0, 23, 59, 59);
    const arr = new Date(arrival);
    const dep = new Date(departure);
    const start = arr > monthStart ? arr : monthStart;
    const end = dep < monthEnd ? dep : monthEnd;
    if (start >= end) return 0;
    const diff = end.getTime() - start.getTime();
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/** Проверка, попадает ли дата в месяц YYYY-MM */
function dateInMonth(date: Date | string, monthKey: string): boolean {
    const d = new Date(date);
    const [y, m] = monthKey.split('-').map(Number);
    return d.getFullYear() === y && d.getMonth() === m - 1;
}

export interface BookingCommissionInput {
    booking: Booking;
    totalNights: number;
    incomesInMonth: number;
    expensesInMonth: number;
    expensesByCategory: Array<{ category: string; amount: number }>;
    /** Маппинг категория → divisibility для определения делимых расходов */
    categoryDivisibilityMap: CategoryDivisibilityMap;
    /** Доходы по брони за выбранный месяц (для детализации шага «Доход за месяц») */
    bookingIncomes: Income[];
    /** Расходы по брони за выбранный месяц (для детализации шагов с расходами) */
    bookingExpenses: Expense[];
}

/** Строка детализации шага расчёта (транзакция учёта) */
export interface CommissionStepLineItem {
    kind: 'income' | 'expense';
    id?: string;
    date: string;
    category: string;
    amount: number;
    comment?: string;
}

export interface CommissionStep {
    description: string;
    value?: number;
    formula?: string;
    /** Транзакции, из которых сложилась сумма шага (если применимо) */
    lineItems?: CommissionStepLineItem[];
    /** Период брони для шага «Количество ночей» */
    nightBooking?: {
        arrival: string;
        departure: string;
    };
}

export interface BookingCommissionResult {
    bookingId: number;
    bookingTitle: string;
    nights: number;
    schemeId: CommissionSchemeId;
    steps: CommissionStep[];
    commission: number;
    income: number;
    totalExpenses: number;
    otaCoAgentExpenses: number;
    divisibleExpenses: number;
    indivisibleExpenses: number;
}

function getOtaCoAgentAmount(expensesByCategory: Array<{ category: string; amount: number }>): number {
    return expensesByCategory
        .filter((e) => isOtaOrCoAgent(e.category))
        .reduce((s, e) => s + e.amount, 0);
}

function getDivisibleAmount(
    expensesByCategory: Array<{ category: string; amount: number }>,
    categoryDivisibilityMap: CategoryDivisibilityMap
): number {
    return expensesByCategory
        .filter((e) => isDivisibleByCategory(categoryDivisibilityMap[e.category]))
        .reduce((s, e) => s + e.amount, 0);
}

function getIndivisibleAmount(
    expensesByCategory: Array<{ category: string; amount: number }>,
    categoryDivisibilityMap: CategoryDivisibilityMap
): number {
    return expensesByCategory
        .filter((e) => !isDivisibleByCategory(categoryDivisibilityMap[e.category]))
        .reduce((s, e) => s + e.amount, 0);
}

function toIsoDate(d: Date | string): string {
    if (d instanceof Date) return d.toISOString();
    const parsed = new Date(d);
    return Number.isNaN(parsed.getTime()) ? String(d) : parsed.toISOString();
}

function mapIncomeLineItems(incomes: Income[]): CommissionStepLineItem[] {
    return incomes.map((i) => ({
        kind: 'income' as const,
        id: i._id,
        date: toIsoDate(i.date as Date | string),
        category: i.category,
        amount: (i.quantity ?? 1) * (i.amount ?? 0),
        comment: i.comment,
    }));
}

function mapExpenseLineItems(expenses: Expense[]): CommissionStepLineItem[] {
    return expenses.map((e) => ({
        kind: 'expense' as const,
        id: e._id,
        date: toIsoDate(e.date as Date | string),
        category: e.category,
        amount: (e.quantity ?? 1) * (e.amount ?? 0),
        comment: e.comment,
    }));
}

/**
 * Расчёт комиссии для одного бронирования по выбранной схеме.
 */
export function calculateBookingCommission(
    input: BookingCommissionInput,
    schemeId: CommissionSchemeId
): BookingCommissionResult {
    const {
        booking,
        totalNights,
        incomesInMonth,
        expensesInMonth,
        expensesByCategory,
        categoryDivisibilityMap,
        bookingIncomes,
        bookingExpenses,
    } = input;
    const steps: CommissionStep[] = [];
    let commission = 0;

    const otaCoAgent = getOtaCoAgentAmount(expensesByCategory);
    const divisible = getDivisibleAmount(expensesByCategory, categoryDivisibilityMap);
    const indivisible = getIndivisibleAmount(expensesByCategory, categoryDivisibilityMap);

    steps.push({
        description: 'Доход за месяц',
        value: incomesInMonth,
        formula: `Σ доходов`,
        lineItems: mapIncomeLineItems(bookingIncomes),
    });
    steps.push({
        description: 'Расходы за месяц',
        value: expensesInMonth,
        formula: `Σ расходов`,
        lineItems: mapExpenseLineItems(bookingExpenses),
    });
    steps.push({
        description: 'Количество ночей',
        value: totalNights,
        nightBooking: {
            arrival: booking.arrival,
            departure: booking.departure,
        },
    });

    if (schemeId === 1) {
        // Схема 1 (OLD)
        if (totalNights <= 30) {
            steps.push({
                description: 'Делимые расходы (категории с divisibility /2 или /3)',
                value: divisible,
                lineItems: mapExpenseLineItems(
                    bookingExpenses.filter((e) => isDivisibleByCategory(categoryDivisibilityMap[e.category]))
                ),
            });
            const base = Math.max(0, incomesInMonth - divisible);
            steps.push({
                description: 'База для комиссии (доход − делимые расходы)',
                value: base,
                formula: `${incomesInMonth} − ${divisible} = ${base}`,
            });
            commission = base * 0.3;
            steps.push({
                description: 'Комиссия 30% (брони до 30 ночей)',
                value: commission,
                formula: `${base} × 30% = ${commission.toFixed(2)}`,
            });
        } else if (totalNights <= 182) {
            commission = incomesInMonth * 0.2;
            steps.push({
                description: 'Комиссия 20% (брони 31–182 ночи, до всех расходов)',
                value: commission,
                formula: `${incomesInMonth} × 20% = ${commission.toFixed(2)}`,
            });
        } else {
            commission = incomesInMonth * 0.15;
            steps.push({
                description: 'Комиссия 15% (брони 183+ ночей, до всех расходов)',
                value: commission,
                formula: `${incomesInMonth} × 15% = ${commission.toFixed(2)}`,
            });
        }
    } else if (schemeId === 2) {
        // Схема 2 (NEW)
        if (totalNights <= 182) {
            steps.push({
                description: 'Расходы OTA и ко-агента (исключаются из базы)',
                value: otaCoAgent,
            });
            const base = Math.max(0, incomesInMonth - otaCoAgent);
            steps.push({
                description: 'База для комиссии (доход − OTA/ко-агент)',
                value: base,
                formula: `${incomesInMonth} − ${otaCoAgent} = ${base}`,
            });
            commission = base * 0.2;
            steps.push({
                description: 'Комиссия 20% (брони 1–182 ночи)',
                value: commission,
                formula: `${base} × 20% = ${commission.toFixed(2)}`,
            });
        } else {
            commission = incomesInMonth * 0.15;
            steps.push({
                description: 'Комиссия 15% (брони 183+ ночей, до всех расходов)',
                value: commission,
                formula: `${incomesInMonth} × 15% = ${commission.toFixed(2)}`,
            });
        }
    } else if (schemeId === 3) {
        // Схема 3 (Special)
        if (totalNights <= 182) {
            steps.push({
                description: 'Расходы OTA и ко-агента (исключаются из базы)',
                value: otaCoAgent,
            });
            const base = Math.max(0, incomesInMonth - otaCoAgent);
            steps.push({
                description: 'База для комиссии (доход − OTA/ко-агент)',
                value: base,
                formula: `${incomesInMonth} − ${otaCoAgent} = ${base}`,
            });
            commission = base * 0.25;
            steps.push({
                description: 'Комиссия 25% (брони 1–182 ночи)',
                value: commission,
                formula: `${base} × 25% = ${commission.toFixed(2)}`,
            });
        } else {
            commission = incomesInMonth * 0.15;
            steps.push({
                description: 'Комиссия 15% (брони 183+ ночей)',
                value: commission,
                formula: `${incomesInMonth} × 15% = ${commission.toFixed(2)}`,
            });
        }
    } else {
        // Схема 4 (Special)
        if (totalNights <= 182) {
            steps.push({
                description: 'Расходы OTA и ко-агента (исключаются из базы)',
                value: otaCoAgent,
            });
            const base = Math.max(0, incomesInMonth - otaCoAgent);
            steps.push({
                description: 'База для комиссии (доход − OTA/ко-агент)',
                value: base,
                formula: `${incomesInMonth} − ${otaCoAgent} = ${base}`,
            });
            commission = base * 0.2;
            steps.push({
                description: 'Комиссия 20% (брони 1–182 ночи)',
                value: commission,
                formula: `${base} × 20% = ${commission.toFixed(2)}`,
            });
        } else {
            commission = incomesInMonth * 0.15;
            steps.push({
                description: 'Комиссия 15% (брони 183+ ночей)',
                value: commission,
                formula: `${incomesInMonth} × 15% = ${commission.toFixed(2)}`,
            });
        }
    }

    return {
        bookingId: booking.id,
        bookingTitle: booking.title || `#${booking.id}`,
        nights: totalNights,
        schemeId,
        steps,
        commission,
        income: incomesInMonth,
        totalExpenses: expensesInMonth,
        otaCoAgentExpenses: otaCoAgent,
        divisibleExpenses: divisible,
        indivisibleExpenses: indivisible,
    };
}

export interface CommissionCalculationParams {
    objectId: number;
    roomId: number | 'all';
    monthKey: string; // YYYY-MM
    schemeId: CommissionSchemeId;
}

export interface CommissionCalculationResult {
    params: CommissionCalculationParams;
    bookings: BookingCommissionResult[];
    totalCommission: number;
    totalIncome: number;
    totalExpenses: number;
}

/** Строит маппинг название категории → divisibility из списка категорий */
function buildCategoryDivisibilityMap(categories: AccountancyCategory[]): CategoryDivisibilityMap {
    const map: CategoryDivisibilityMap = {};
    for (const c of categories) {
        if (c.name) {
            map[c.name] = c.divisibility;
        }
    }
    return map;
}

/**
 * Собирает данные для расчёта комиссии: бронирования, доходы и расходы за месяц.
 * @param categories — категории расходов (type='expense') для определения divisibility
 */
/**
 * @param accountingObjectId — id «объекта» в учёте (после миграции — roomType id): фильтр доходов/расходов.
 * @param propertyIdForBookings — id property в Beds24 для фильтра броней; если не задан, используется accountingObjectId (legacy).
 */
export function prepareCommissionData(
    bookings: Booking[],
    incomes: Income[],
    expenses: Expense[],
    categories: AccountancyCategory[],
    accountingObjectId: number,
    roomId: number | 'all',
    monthKey: string,
    propertyIdForBookings?: number
): BookingCommissionInput[] {
    const categoryDivisibilityMap = buildCategoryDivisibilityMap(
        categories.filter((c) => c.type === 'expense')
    );
    const [y, m] = monthKey.split('-').map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0, 23, 59, 59);

    const bookingPropertyId = propertyIdForBookings ?? accountingObjectId;

    const filteredBookings = bookings.filter((b) => {
        if (b.propertyId !== bookingPropertyId) return false;
        if (roomId !== 'all' && b.unitId !== roomId) return false;
        return true;
    });

    return filteredBookings.map((booking) => {
        const bookingIncomes = incomes.filter(
            (i) =>
                i.bookingId === booking.id &&
                i.objectId === accountingObjectId &&
                dateInMonth(i.date, monthKey)
        );
        const bookingExpenses = expenses.filter(
            (e) =>
                e.bookingId === booking.id &&
                e.objectId === accountingObjectId &&
                dateInMonth(e.date, monthKey)
        );

        const getExpenseSum = (e: { amount?: number; quantity?: number }) => (e.quantity ?? 1) * (e.amount ?? 0);
        const getIncomeSum = (i: { amount?: number; quantity?: number }) => (i.quantity ?? 1) * (i.amount ?? 0);
        const incomesInMonth = bookingIncomes.reduce((s, i) => s + getIncomeSum(i), 0);
        const expensesInMonth = bookingExpenses.reduce((s, e) => s + getExpenseSum(e), 0);

        const expensesByCategory = bookingExpenses.reduce(
            (acc, e) => {
                const sum = getExpenseSum(e);
                const existing = acc.find((x) => x.category === e.category);
                if (existing) {
                    existing.amount += sum;
                } else {
                    acc.push({ category: e.category, amount: sum });
                }
                return acc;
            },
            [] as Array<{ category: string; amount: number }>
        );

        const totalNights = getNightsCount(booking.arrival, booking.departure);

        return {
            booking,
            totalNights,
            incomesInMonth,
            expensesInMonth,
            expensesByCategory,
            categoryDivisibilityMap,
            bookingIncomes,
            bookingExpenses,
        };
    });
}

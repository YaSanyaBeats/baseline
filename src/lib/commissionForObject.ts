import {
    CommissionSchemeId,
    prepareCommissionData,
    calculateBookingCommission,
} from '@/lib/commissionCalculation';
import { getBookingsByIds, searchBookings } from '@/lib/bookings';
import {
    bookingMatchesOwnerRooms,
    transactionMatchesOwnerRooms,
} from '@/lib/ownerObjectsFilter';
import type { AccountancyCategory, Booking, Expense, Income, Object as AppObject } from '@/lib/types';

const DEFAULT_SCHEME_ID: CommissionSchemeId = 2;

function monthOverlapIsoRange(monthKey: string): { overlapFrom: string; overlapTo: string } {
    const [y, m] = monthKey.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
        return { overlapFrom: `${monthKey}-01`, overlapTo: `${monthKey}-28` };
    }
    const last = new Date(y, m, 0).getDate();
    return {
        overlapFrom: `${y}-${String(m).padStart(2, '0')}-01`,
        overlapTo: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    };
}

function lineTotal(quantity: number | undefined, amount: number | undefined): number {
    return (quantity ?? 1) * (amount ?? 0);
}

export type ObjectCommissionResult = {
    objectId: number;
    objectName: string;
    roomsForObject: AppObject['roomTypes'];
    bookingsReport: Array<{
        booking: Booking;
        calculation: ReturnType<typeof calculateBookingCommission>;
        incomes: Income[];
        expenses: Expense[];
    }>;
    unlinkedIncomes: Income[];
    unlinkedExpenses: Expense[];
    totalCommission: number;
    unlinkedExpensesAmount: number;
    totalWithUnlinkedExpenses: number;
    totalIncome: number;
    totalExpenses: number;
    totalLinkedIncome: number;
    totalLinkedExpense: number;
    totalUnlinkedIncome: number;
    totalUnlinkedExpense: number;
};

export async function calculateCommissionForObject(
    obj: AppObject,
    selectedMonth: string,
    incomes: Income[],
    expenses: Expense[],
    categories: AccountancyCategory[]
): Promise<ObjectCommissionResult> {
    const selectedObjectId = obj.id;
    const roomsForObject = obj.roomTypes ?? [];
    const roomFilter: string | 'all' = 'all';
    const bookingPropertyId = obj.propertyId ?? obj.id;

    const [y, m] = selectedMonth.split('-').map(Number);
    const dateInMonth = (d: Date | string) => {
        const date = new Date(d);
        return date.getFullYear() === y && date.getMonth() === m - 1;
    };
    const matchRoom = (roomName: string | null | undefined) =>
        transactionMatchesOwnerRooms(roomName, roomsForObject, roomFilter);

    const { overlapFrom, overlapTo } = monthOverlapIsoRange(selectedMonth);

    const overlapBookings = await searchBookings({
        objectId: bookingPropertyId,
        overlapFrom,
        overlapTo,
    });

    const overlapFiltered = overlapBookings.filter((b) =>
        bookingMatchesOwnerRooms(b, bookingPropertyId, roomsForObject, roomFilter)
    );

    const txnBookingIds = new Set<number>();
    for (const i of incomes) {
        if (i.objectId !== selectedObjectId || !dateInMonth(i.date) || !matchRoom(i.roomName ?? null))
            continue;
        if (i.bookingId != null) txnBookingIds.add(i.bookingId);
    }
    for (const e of expenses) {
        if (e.objectId !== selectedObjectId || !dateInMonth(e.date) || !matchRoom(e.roomName ?? null))
            continue;
        if (e.bookingId != null) txnBookingIds.add(e.bookingId);
    }

    const missingFromOverlap = [...txnBookingIds].filter(
        (id) => !overlapFiltered.some((b) => b.id === id)
    );
    const extras = missingFromOverlap.length ? await getBookingsByIds(missingFromOverlap) : [];
    const extrasFiltered = extras.filter((b) =>
        bookingMatchesOwnerRooms(b, bookingPropertyId, roomsForObject, roomFilter)
    );

    const byId = new Map<number, Booking>();
    for (const b of overlapFiltered) byId.set(b.id, b);
    for (const b of extrasFiltered) byId.set(b.id, b);

    const mergedBookings = Array.from(byId.values()).sort(
        (a, c) => new Date(a.arrival).getTime() - new Date(c.arrival).getTime()
    );

    const inputs = prepareCommissionData(
        mergedBookings,
        incomes,
        expenses,
        categories,
        selectedObjectId,
        roomFilter,
        selectedMonth,
        bookingPropertyId,
        roomsForObject
    );

    const getSchemeForBooking = (booking: Booking): CommissionSchemeId => {
        const room = roomsForObject.find((r) => r.id === booking.unitId);
        const scheme = room?.commissionSchemeId;
        return (scheme && scheme >= 1 && scheme <= 4 ? scheme : DEFAULT_SCHEME_ID) as CommissionSchemeId;
    };

    const results = inputs.map((input) =>
        calculateBookingCommission(input, getSchemeForBooking(input.booking))
    );

    const unlinkedIncomes = incomes.filter(
        (i) =>
            i.objectId === selectedObjectId &&
            i.bookingId == null &&
            dateInMonth(i.date) &&
            matchRoom(i.roomName ?? null)
    );
    const unlinkedExpenses = expenses.filter(
        (e) =>
            e.objectId === selectedObjectId &&
            e.bookingId == null &&
            dateInMonth(e.date) &&
            matchRoom(e.roomName ?? null)
    );

    const bookingsReport = mergedBookings.map((booking, idx) => {
        const calculation = results[idx]!;
        const incomesRows = incomes.filter(
            (i) =>
                i.objectId === selectedObjectId &&
                i.bookingId === booking.id &&
                dateInMonth(i.date) &&
                matchRoom(i.roomName ?? null)
        );
        const expensesRows = expenses.filter(
            (e) =>
                e.objectId === selectedObjectId &&
                e.bookingId === booking.id &&
                dateInMonth(e.date) &&
                matchRoom(e.roomName ?? null)
        );
        return { booking, calculation, incomes: incomesRows, expenses: expensesRows };
    });

    const commissionFromBookings = results.reduce((s, r) => s + r.commission, 0);
    const unlinkedExpensesAmount = unlinkedExpenses.reduce((s, e) => s + lineTotal(e.quantity, e.amount), 0);
    const totalCommission = commissionFromBookings;
    const totalWithUnlinkedExpenses = totalCommission + unlinkedExpensesAmount;

    const totalUnlinkedIncome = unlinkedIncomes.reduce((s, i) => s + lineTotal(i.quantity, i.amount), 0);
    const totalUnlinkedExpense = unlinkedExpensesAmount;

    const totalLinkedIncome = results.reduce((s, r) => s + r.income, 0);
    const totalLinkedExpense = results.reduce((s, r) => s + r.totalExpenses, 0);

    const totalIncome = totalLinkedIncome + totalUnlinkedIncome;
    const totalExpenses = totalLinkedExpense + totalUnlinkedExpense;

    return {
        objectId: selectedObjectId,
        objectName: obj.name,
        roomsForObject,
        bookingsReport,
        unlinkedIncomes,
        unlinkedExpenses,
        totalCommission,
        unlinkedExpensesAmount,
        totalWithUnlinkedExpenses,
        totalIncome,
        totalExpenses,
        totalLinkedIncome,
        totalLinkedExpense,
        totalUnlinkedIncome,
        totalUnlinkedExpense,
    };
}

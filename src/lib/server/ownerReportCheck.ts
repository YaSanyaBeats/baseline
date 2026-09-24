import type { Db } from 'mongodb';
import { MIN_LEDGER_REPORT_MONTH } from '@/lib/accountancyClosedMonth';
import type { BookingSearchParams } from '@/lib/bookings';
import type { BookingFetchers } from '@/lib/commissionForObject';
import { computeCommissionOwnerViewPayloads } from '@/lib/commissionOwnerViewCore';
import {
    checkRoomEarningsAgainstSettlements,
    OWNER_REPORT_CHECK_LOCALES,
    type OwnerReportCheckLocale,
    type OwnerReportCheckRow,
} from '@/lib/ownerViewRoomEarnings';
import { getDB } from '@/lib/db/getDB';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { getBookingsByIdsFromDb, searchBookingsFromDb } from '@/lib/server/bookingsQuery';
import { getObjects } from '@/lib/server/getObjects';
import { loadAllCommissionRatesForMonth } from '@/lib/server/bookingManagementCommissionRates';
import type {
    AccountancyCategory,
    Booking,
    BookingManagementCommissionRate,
    Expense,
    Income,
    User,
} from '@/lib/types';

export type { OwnerReportCheckLocale, OwnerReportCheckRow };

export type OwnerReportCheckResult = {
    months: string[];
    rows: OwnerReportCheckRow[];
};

/** Месяцы отчётов с декабря 2025 по текущий включительно, новые сверху. */
export function ownerReportCheckMonthKeys(now = new Date()): string[] {
    const [startYear, startMonth] = MIN_LEDGER_REPORT_MONTH.split('-').map(Number);
    let year = startYear;
    let month = startMonth;
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;
    const months: string[] = [];

    while (year < endYear || (year === endYear && month <= endMonth)) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }

    return months.reverse();
}

function mapDbUser(doc: Record<string, unknown>): User {
    return {
        ...doc,
        _id: normalizeMongoIdString(doc._id),
    } as User;
}

function cachedBookingFetchers(db: Db): BookingFetchers {
    const searchCache = new Map<string, Booking[]>();
    const idsCache = new Map<string, Booking[]>();

    return {
        searchBookings: async (params: BookingSearchParams) => {
            const key = JSON.stringify(params);
            const cached = searchCache.get(key);
            if (cached) return cached;
            const found = await searchBookingsFromDb(db, params);
            searchCache.set(key, found);
            return found;
        },
        getBookingsByIds: async (ids: number[]) => {
            const key = [...ids].sort((a, b) => a - b).join(',');
            const cached = idsCache.get(key);
            if (cached) return cached;
            const found = await getBookingsByIdsFromDb(db, ids);
            idsCache.set(key, found);
            return found;
        },
    };
}

export async function runOwnerReportCheck(db?: Db): Promise<OwnerReportCheckResult> {
    const database = db ?? (await getDB());
    const months = ownerReportCheckMonthKeys();
    const bookingFetchers = cachedBookingFetchers(database);
    const ratesByMonth = new Map<string, Map<number, BookingManagementCommissionRate>>();

    const [ownerDocs, objects, expenseDocs, incomeDocs, categoryDocs] = await Promise.all([
        database.collection('users').find({ role: 'owner' }).toArray(),
        getObjects(),
        database.collection('expenses').find({}).toArray(),
        database.collection('incomes').find({}).toArray(),
        database
            .collection('accountancyCategories')
            .find({})
            .sort({ parentId: 1, order: 1, name: 1 })
            .toArray(),
    ]);

    const owners = ownerDocs.map((doc) => mapDbUser(doc as Record<string, unknown>));
    const expenses = expenseDocs.map((doc) => ({
        ...(doc as unknown as Expense),
        _id: normalizeMongoIdString((doc as { _id?: unknown })._id) || undefined,
        categoryId: normalizeMongoIdString((doc as { categoryId?: unknown }).categoryId) || undefined,
        parentExpenseId:
            normalizeMongoIdString((doc as { parentExpenseId?: unknown }).parentExpenseId) || undefined,
    }));
    const incomes = incomeDocs.map((doc) => ({
        ...(doc as unknown as Income),
        _id: normalizeMongoIdString((doc as { _id?: unknown })._id) || undefined,
        categoryId: normalizeMongoIdString((doc as { categoryId?: unknown }).categoryId) || undefined,
        parentExpenseId:
            normalizeMongoIdString((doc as { parentExpenseId?: unknown }).parentExpenseId) || undefined,
    }));
    const categories = categoryDocs.map((doc) => ({
        ...(doc as unknown as AccountancyCategory),
        _id: normalizeMongoIdString((doc as { _id?: unknown })._id) || undefined,
    }));

    const rows: OwnerReportCheckRow[] = [];

    for (const owner of owners) {
        if (!owner._id) continue;
        const ownerName = (owner.name || owner.login || owner._id).trim();

        for (const monthKey of months) {
            let rates = ratesByMonth.get(monthKey);
            if (!rates) {
                rates = await loadAllCommissionRatesForMonth(database, monthKey);
                ratesByMonth.set(monthKey, rates);
            }

            const payloads = await computeCommissionOwnerViewPayloads({
                owner,
                monthKey,
                locales: OWNER_REPORT_CHECK_LOCALES,
                objects,
                expenses,
                incomes,
                categories,
                bookingFetchers,
                ratesByBookingId: rates,
            });

            for (const payload of payloads) {
                const locale: OwnerReportCheckLocale = payload.language.startsWith('en')
                    ? 'en-US'
                    : 'ru-RU';
                const checks = checkRoomEarningsAgainstSettlements(
                    payload.roomSections,
                    payload.settlementRows
                );
                for (const check of checks) {
                    rows.push({
                        ownerId: owner._id,
                        ownerName,
                        monthKey,
                        locale,
                        roomKey: check.roomKey,
                        roomTitle: check.roomTitle,
                        roomTotal: check.roomTotal,
                        passed: check.passed,
                        zeroTotal: check.zeroTotal,
                    });
                }
            }
        }
    }

    rows.sort((a, b) => {
        const byMonth = b.monthKey.localeCompare(a.monthKey);
        if (byMonth !== 0) return byMonth;
        const byOwner = a.ownerName.localeCompare(b.ownerName, 'ru');
        if (byOwner !== 0) return byOwner;
        const byRoom = a.roomTitle.localeCompare(b.roomTitle, 'ru');
        if (byRoom !== 0) return byRoom;
        return a.locale.localeCompare(b.locale);
    });

    return { months, rows };
}

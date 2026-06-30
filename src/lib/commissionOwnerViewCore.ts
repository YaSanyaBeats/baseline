import { buildCategoryNameByIdMap } from '@/lib/accountancyCategoryResolve';
import {
    buildCommissionOwnerViewPayload,
    collectOwnerViewExtraBookingIds,
    type CommissionOwnerViewStoredPayload,
    type CommissionPageResultForOwner,
} from '@/lib/commissionOwnerView';
import {
    calculateCommissionForObject,
    type BookingFetchers,
} from '@/lib/commissionForObject';
import { filterObjectsForOwner } from '@/lib/ownerObjectsFilter';
import type {
    AccountancyCategory,
    Expense,
    Income,
    Object as AppObject,
    User,
} from '@/lib/types';

export type ComputeCommissionOwnerViewParams = {
    owner: User;
    monthKey: string;
    locale: string;
    objects: AppObject[];
    expenses: Expense[];
    incomes: Income[];
    categories: AccountancyCategory[];
    bookingFetchers?: BookingFetchers;
};

export async function computeCommissionOwnerViewPayload(
    params: ComputeCommissionOwnerViewParams
): Promise<CommissionOwnerViewStoredPayload | null> {
    const { owner, monthKey, locale, objects, expenses, incomes, categories, bookingFetchers } =
        params;

    const ownerObjects = filterObjectsForOwner(objects, owner.objects ?? []);
    if (ownerObjects.length === 0) return null;

    const categoryNameById = buildCategoryNameByIdMap(categories);

    const objectReports = await Promise.all(
        ownerObjects.map((obj) =>
            calculateCommissionForObject(
                obj,
                monthKey,
                incomes,
                expenses,
                categories,
                bookingFetchers
            )
        )
    );

    const reportTitle = owner.name || owner.login || '';
    const totalCommission = objectReports.reduce((s, r) => s + r.totalCommission, 0);
    const unlinkedExpensesAmount = objectReports.reduce((s, r) => s + r.unlinkedExpensesAmount, 0);
    const totalUnlinkedIncome = objectReports.reduce((s, r) => s + r.totalUnlinkedIncome, 0);
    const totalLinkedIncome = objectReports.reduce((s, r) => s + r.totalLinkedIncome, 0);
    const totalLinkedExpense = objectReports.reduce((s, r) => s + r.totalLinkedExpense, 0);
    const totalIncome = totalLinkedIncome + totalUnlinkedIncome;
    const totalExpenses = totalLinkedExpense + unlinkedExpensesAmount;

    const result: CommissionPageResultForOwner = {
        reportTitle,
        monthKey,
        objectReports,
        totalIncome,
        totalExpenses,
        totalCommission,
    };

    const missingBookingIds = collectOwnerViewExtraBookingIds(
        objectReports,
        monthKey,
        categoryNameById,
        categories,
        incomes,
        expenses
    );

    const getBookingsByIds = bookingFetchers?.getBookingsByIds;
    const extraBookings =
        missingBookingIds.length > 0 && getBookingsByIds
            ? await getBookingsByIds(missingBookingIds)
            : [];

    return buildCommissionOwnerViewPayload(
        result,
        locale,
        categoryNameById,
        categories,
        incomes,
        expenses,
        extraBookings,
        owner.objects ?? [],
        ownerObjects
    );
}

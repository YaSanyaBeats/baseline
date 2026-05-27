import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoryNameByIdMap } from '@/lib/accountancyCategoryResolve';
import { getBookingsByIds } from '@/lib/bookings';
import {
    buildCommissionOwnerViewPayload,
    collectOwnerViewExtraBookingIds,
    type CommissionOwnerViewStoredPayload,
    type CommissionPageResultForOwner,
} from '@/lib/commissionOwnerView';
import { calculateCommissionForObject } from '@/lib/commissionForObject';
import { getExpenses } from '@/lib/expenses';
import { getIncomes } from '@/lib/incomes';
import { filterObjectsForOwner } from '@/lib/ownerObjectsFilter';
import { getUsers } from '@/lib/users';
import type { Object as AppObject } from '@/lib/types';

export type LoadCommissionOwnerViewParams = {
    ownerId: string;
    monthKey: string;
    locale: string;
    objects: AppObject[];
};

export async function loadCommissionOwnerViewPayload(
    params: LoadCommissionOwnerViewParams
): Promise<CommissionOwnerViewStoredPayload | null> {
    const { ownerId, monthKey, locale, objects } = params;

    const [expenses, incomes, categories, usersList] = await Promise.all([
        getExpenses(),
        getIncomes(),
        getAccountancyCategories(),
        getUsers(),
    ]);

    const owner = usersList.find((u) => u._id === ownerId && u.role === 'owner');
    if (!owner) return null;

    const ownerObjects = filterObjectsForOwner(objects, owner.objects ?? []);
    if (ownerObjects.length === 0) return null;

    const categoryNameById = buildCategoryNameByIdMap(categories);

    const objectReports = await Promise.all(
        ownerObjects.map((obj) =>
            calculateCommissionForObject(obj, monthKey, incomes, expenses, categories)
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
    const extraBookings =
        missingBookingIds.length > 0 ? await getBookingsByIds(missingBookingIds) : [];

    return buildCommissionOwnerViewPayload(
        result,
        locale,
        categoryNameById,
        categories,
        incomes,
        expenses,
        extraBookings
    );
}

import type { Db } from 'mongodb';

/** Минимальный месяц отчёта, который сохраняется (декабрь 2025 и позже). */
export const RETAINED_REPORT_MONTH_FROM = '2025-12';

function buildDeleteFilter() {
    return {
        reportMonth: { $type: 'string', $lt: RETAINED_REPORT_MONTH_FROM },
    };
}

export type DeleteTransactionsBeforeReportMonthStats = {
    dryRun: boolean;
    expensesMatched: number;
    expensesDeleted: number;
    incomesMatched: number;
    incomesDeleted: number;
};

export async function runDeleteTransactionsBeforeReportMonth(
    db: Db,
    options: { dryRun?: boolean } = {},
): Promise<DeleteTransactionsBeforeReportMonthStats> {
    const dryRun = options.dryRun ?? false;
    const filter = buildDeleteFilter();

    const expensesCollection = db.collection('expenses');
    const incomesCollection = db.collection('incomes');

    const expensesMatched = await expensesCollection.countDocuments(filter);
    const incomesMatched = await incomesCollection.countDocuments(filter);

    if (dryRun) {
        return {
            dryRun: true,
            expensesMatched,
            expensesDeleted: 0,
            incomesMatched,
            incomesDeleted: 0,
        };
    }

    const expRes = await expensesCollection.deleteMany(filter);
    const incRes = await incomesCollection.deleteMany(filter);

    return {
        dryRun: false,
        expensesMatched,
        expensesDeleted: expRes.deletedCount,
        incomesMatched,
        incomesDeleted: incRes.deletedCount,
    };
}

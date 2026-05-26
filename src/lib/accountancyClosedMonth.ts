import type { Db } from 'mongodb';

export const ACCOUNTANCY_CLOSED_MONTHS_COLLECTION = 'accountancyClosedMonths';

export const REPORT_MONTH_CLOSED_MESSAGE =
    'Отчётный период зафиксирован. Добавление, изменение и удаление транзакций за этот месяц недоступно.';

export type ClosedMonthCheckResult =
    | { ok: true }
    | { ok: false; message: string; code: 'REPORT_MONTH_CLOSED' };

/** Месяц YYYY-MM: отчётный месяц записи, иначе календарный по дате операции. */
export function resolveLedgerMonth(
    date: Date | string | undefined,
    reportMonth: string | undefined | null,
): string | null {
    const rm = (reportMonth ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(rm)) return rm;
    if (!date) return null;
    const parsed = new Date(date as string | Date);
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

export function isValidReportMonthKey(value: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value.trim());
}

export async function getClosedReportMonths(db: Db): Promise<string[]> {
    const docs = await db
        .collection(ACCOUNTANCY_CLOSED_MONTHS_COLLECTION)
        .find({})
        .project({ reportMonth: 1 })
        .sort({ reportMonth: -1 })
        .toArray();
    return docs.map((d) => String(d.reportMonth));
}

export async function getClosedReportMonthsSet(db: Db): Promise<Set<string>> {
    const months = await getClosedReportMonths(db);
    return new Set(months);
}

export async function isReportMonthClosed(db: Db, reportMonth: string): Promise<boolean> {
    if (!isValidReportMonthKey(reportMonth)) return false;
    const doc = await db.collection(ACCOUNTANCY_CLOSED_MONTHS_COLLECTION).findOne({ reportMonth: reportMonth.trim() });
    return Boolean(doc);
}

export async function assertLedgerMonthOpen(
    db: Db,
    date: Date | string | undefined,
    reportMonth: string | undefined | null,
    closedCache?: Set<string>,
): Promise<ClosedMonthCheckResult> {
    const month = resolveLedgerMonth(date, reportMonth);
    if (!month) return { ok: true };

    const closed = closedCache ?? (await getClosedReportMonthsSet(db));
    if (closed.has(month)) {
        return { ok: false, message: REPORT_MONTH_CLOSED_MESSAGE, code: 'REPORT_MONTH_CLOSED' };
    }
    return { ok: true };
}

export type TransactionLedgerFields = {
    date?: Date | string;
    reportMonth?: string | null;
};

export async function assertTransactionDocEditable(
    db: Db,
    doc: TransactionLedgerFields | null | undefined,
    closedCache?: Set<string>,
): Promise<ClosedMonthCheckResult> {
    if (!doc) return { ok: true };
    return assertLedgerMonthOpen(db, doc.date, doc.reportMonth, closedCache);
}

export async function assertTransactionMutationAllowed(
    db: Db,
    params: {
        date: Date | string | undefined;
        reportMonth: string | undefined | null;
        existingDoc?: TransactionLedgerFields | null;
    },
    closedCache?: Set<string>,
): Promise<ClosedMonthCheckResult> {
    const newCheck = await assertLedgerMonthOpen(db, params.date, params.reportMonth, closedCache);
    if (!newCheck.ok) return newCheck;

    if (params.existingDoc) {
        const oldCheck = await assertLedgerMonthOpen(
            db,
            params.existingDoc.date,
            params.existingDoc.reportMonth,
            closedCache,
        );
        if (!oldCheck.ok) return oldCheck;
    }

    return { ok: true };
}

import type { Db } from 'mongodb';
import { isBookingArrivalOnOrAfter } from '@/lib/beds24/bookingSyncWindow';
import { runRulesForBookings } from '@/lib/autoAccountingEngine';

/** Заезд с 1 сентября 2026 включительно: сентябрь, октябрь, ноябрь и дальше. */
export const AUTO_TRANSACTIONS_MIGRATION_ARRIVAL_FROM = '2026-09-01';

export const AUTO_TRANSACTIONS_MIGRATION_BATCH = 20;

export type AutoTransactionsMigrationPreview = {
    arrivalFrom: string;
    matched: number;
    alreadyProcessed: number;
    eligible: number;
};

type BookingIdDoc = {
    id?: unknown;
    arrival?: unknown;
};

/**
 * Брони с заездом не раньше сентября 2026, по которым автоучёт ещё не запускался.
 */
export async function previewAutoTransactionsMigration(
    db: Db,
): Promise<AutoTransactionsMigrationPreview & { eligibleIds: number[] }> {
    const arrivalFrom = AUTO_TRANSACTIONS_MIGRATION_ARRIVAL_FROM;
    const cutoffDate = new Date(`${arrivalFrom}T00:00:00.000Z`);
    const docs = (await db
        .collection('bookings')
        .find(
            {
                $or: [{ arrival: { $gte: arrivalFrom } }, { arrival: { $gte: cutoffDate } }],
            },
            { projection: { id: 1, arrival: 1 } },
        )
        .toArray()) as BookingIdDoc[];

    const matchedIds: number[] = [];
    const seen = new Set<number>();
    for (const doc of docs) {
        const id = typeof doc.id === 'number' ? doc.id : Number(doc.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (!isBookingArrivalOnOrAfter(doc.arrival, arrivalFrom)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        matchedIds.push(id);
    }

    const processedDocs =
        matchedIds.length === 0
            ? []
            : await db
                  .collection('autoAccountingProcessedBookings')
                  .find({ bookingId: { $in: matchedIds } }, { projection: { bookingId: 1 } })
                  .toArray();
    const processed = new Set(
        processedDocs
            .map((doc) => doc.bookingId)
            .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
    );
    const eligibleIds = matchedIds.filter((id) => !processed.has(id));

    return {
        arrivalFrom,
        matched: matchedIds.length,
        alreadyProcessed: matchedIds.length - eligibleIds.length,
        eligible: eligibleIds.length,
        eligibleIds,
    };
}

export async function runAutoTransactionsMigrationBatch(
    db: Db,
    accountantId: string | null,
    limit = AUTO_TRANSACTIONS_MIGRATION_BATCH,
): Promise<{
    arrivalFrom: string;
    bookingsProcessed: number;
    expensesCreated: number;
    incomesCreated: number;
    rulesSkipped: number;
    remaining: number;
    errors: string[];
}> {
    const preview = await previewAutoTransactionsMigration(db);
    const batchSize = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : AUTO_TRANSACTIONS_MIGRATION_BATCH;
    const batch = preview.eligibleIds.slice(0, batchSize);
    if (batch.length === 0) {
        return {
            arrivalFrom: preview.arrivalFrom,
            bookingsProcessed: 0,
            expensesCreated: 0,
            incomesCreated: 0,
            rulesSkipped: 0,
            remaining: 0,
            errors: [],
        };
    }

    const result = await runRulesForBookings(batch, accountantId, { bookingLinkedOnly: true });
    return {
        arrivalFrom: preview.arrivalFrom,
        bookingsProcessed: batch.length,
        expensesCreated: result.expensesCreated,
        incomesCreated: result.incomesCreated,
        rulesSkipped: result.rulesSkipped,
        remaining: Math.max(0, preview.eligible - batch.length),
        errors: result.errors,
    };
}

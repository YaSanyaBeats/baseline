import { ObjectId } from 'mongodb';
import { getDB } from '@/lib/db/getDB';
import { computeCommissionOwnerViewPayload } from '@/lib/commissionOwnerViewCore';
import type { CommissionOwnerViewStoredPayload } from '@/lib/commissionOwnerView';
import { getBookingsByIdsFromDb, searchBookingsFromDb } from '@/lib/server/bookingsQuery';
import { getObjects, getObjectsForSession } from '@/lib/server/getObjects';
import { normalizeMongoIdString } from '@/lib/mongoId';
import type { AccountancyCategory, Expense, Income, User } from '@/lib/types';

function mapDbUser(doc: Record<string, unknown>): User {
    return {
        ...doc,
        _id: normalizeMongoIdString(doc._id),
    } as User;
}

export async function loadCommissionOwnerViewPayloadServer(
    session: { user?: Record<string, unknown> | null },
    ownerId: string,
    monthKey: string,
    locale: string
): Promise<CommissionOwnerViewStoredPayload | null> {
    if (!session?.user) return null;

    const userRole = session.user.role as string | undefined;
    const sessionUserId = normalizeMongoIdString(session.user._id);

    if (userRole === 'owner') {
        if (!sessionUserId || sessionUserId !== ownerId) return null;
    } else if (userRole !== 'admin' && userRole !== 'accountant') {
        return null;
    }

    const db = await getDB();

    let ownerDoc: Record<string, unknown> | null;
    try {
        ownerDoc = await db.collection('users').findOne({
            _id: new ObjectId(ownerId),
            role: 'owner',
        });
    } catch {
        return null;
    }
    if (!ownerDoc) return null;

    const owner = mapDbUser(ownerDoc);

    const [expenseDocs, incomeDocs, categoryDocs] = await Promise.all([
        db.collection('expenses').find({}).toArray(),
        db.collection('incomes').find({}).toArray(),
        db
            .collection('accountancyCategories')
            .find({})
            .sort({ parentId: 1, order: 1, name: 1 })
            .toArray(),
    ]);

    const expenses = expenseDocs as unknown as Expense[];
    const incomes = incomeDocs as unknown as Income[];
    const categories = categoryDocs as unknown as AccountancyCategory[];

    const objects =
        userRole === 'admin' || userRole === 'accountant'
            ? await getObjects()
            : await getObjectsForSession(session);

    const bookingFetchers = {
        searchBookings: (params: Parameters<typeof searchBookingsFromDb>[1]) =>
            searchBookingsFromDb(db, params),
        getBookingsByIds: (ids: number[]) => getBookingsByIdsFromDb(db, ids),
    };

    return computeCommissionOwnerViewPayload({
        owner,
        monthKey,
        locale,
        objects,
        expenses,
        incomes,
        categories,
        bookingFetchers,
    });
}

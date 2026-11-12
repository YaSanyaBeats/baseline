import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { BEDS24_SYNC_JOURNAL_COLLECTION } from '@/lib/beds24/bookingSyncMerge';
import { getDB } from '@/lib/db/getDB';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        const role = (session?.user as { role?: string } | undefined)?.role;
        if (!session || role !== 'admin') {
            return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
        }

        const db = await getDB();
        const docs = await db
            .collection(BEDS24_SYNC_JOURNAL_COLLECTION)
            .find({})
            .sort({ createdAt: -1 })
            .limit(40)
            .toArray();

        return NextResponse.json({
            success: true,
            entries: docs.map((doc) => ({
                id: String(doc._id),
                createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
                source: doc.source === 'daily' ? 'daily' : 'manual',
                status: doc.status === 'error' ? 'error' : 'success',
                arrivalFrom: doc.arrivalFrom ?? null,
                incoming: doc.incoming ?? 0,
                kept: doc.kept ?? 0,
                replaced: doc.replaced ?? 0,
                preservedClosed: doc.preservedClosed ?? 0,
                skippedTotal: doc.skippedTotal ?? 0,
                error: typeof doc.error === 'string' ? doc.error : null,
                skipped: Array.isArray(doc.skipped) ? doc.skipped : [],
            })),
        });
    } catch (error) {
        console.error('Error in GET /api/beds24/sync-journal:', error);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}

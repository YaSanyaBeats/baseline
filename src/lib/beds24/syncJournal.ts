import type { Db } from 'mongodb';
import {
    BEDS24_SYNC_JOURNAL_COLLECTION,
    type BookingSyncSkip,
} from '@/lib/beds24/bookingSyncMerge';

export type Beds24SyncJournalSource = 'manual' | 'daily';

export type Beds24SyncJournalEntry = {
    createdAt: Date;
    type: 'bookings';
    source: Beds24SyncJournalSource;
    status: 'success' | 'error';
    arrivalFrom?: string;
    incoming?: number;
    kept?: number;
    replaced?: number;
    preservedClosed?: number;
    skippedTotal?: number;
    skipped?: BookingSyncSkip[];
    error?: string;
};

export async function writeBookingSyncJournal(db: Db, entry: Beds24SyncJournalEntry): Promise<void> {
    try {
        const collection = db.collection(BEDS24_SYNC_JOURNAL_COLLECTION);
        await collection.insertOne(entry);
    } catch (error) {
        console.error('Failed to write Beds24 sync journal', error);
    }
}

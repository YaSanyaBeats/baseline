import { NextRequest, NextResponse } from 'next/server';
import { Beds24Connect } from '@/lib/beds24/Beds24Connect';
import { bookingsSyncArrivalFrom } from '@/lib/beds24/bookingSyncWindow';
import { mergeBookingsPreservingPast } from '@/lib/beds24/bookingSyncMerge';
import { replaceCollection } from '@/lib/beds24/replaceCollection';
import { writeBookingSyncJournal, type Beds24SyncJournalSource } from '@/lib/beds24/syncJournal';
import { getDB } from '@/lib/db/getDB';

const BOOKINGS_ARRIVAL_TO = '2029-01-01';

const SYNC_TYPES = new Set(['objects', 'prices', 'bookings']);

function assertBeds24Page(
    result: { error?: unknown; pages?: { nextPageExists?: boolean }; detail?: unknown },
    type: string,
    page: number,
): void {
    if (result?.error || result?.pages == null) {
        console.error(`[Beds24] ${type} sync failed on page ${page}`, result?.detail ?? result);
        const detailText = result?.detail != null ? ` ${JSON.stringify(result.detail)}` : '';
        throw new Error(`Beds24 ${type} sync failed on page ${page}.${detailText}`);
    }
}

async function fetchBeds24Page(
    beds24: Beds24Connect,
    type: string,
    page: number,
    bookingsArrivalFrom?: string,
) {
    if (type === 'objects') {
        const objects = await beds24.get('properties', {
            includeAllRooms: true,
            includeUnitDetails: true,
            page,
        });
        assertBeds24Page(objects, type, page);
        return {
            data: (objects.data ?? []) as Record<string, unknown>[],
            nextPageExists: Boolean(objects.pages.nextPageExists),
        };
    }

    if (type === 'prices') {
        const prices = await beds24.get('inventory/fixedPrices', { page });
        assertBeds24Page(prices, type, page);
        return {
            data: (prices.data ?? []) as Record<string, unknown>[],
            nextPageExists: Boolean(prices.pages.nextPageExists),
        };
    }

    const bookings = await beds24.get('bookings', {
        includeInvoiceItems: true,
        includeInfoItems: true,
        includeGuests: true,
        includeBookingGroup: true,
        arrivalFrom: bookingsArrivalFrom,
        arrivalTo: BOOKINGS_ARRIVAL_TO,
        page,
    });
    assertBeds24Page(bookings, type, page);
    return {
        data: (bookings.data ?? []) as Record<string, unknown>[],
        nextPageExists: Boolean(bookings.pages.nextPageExists),
    };
}

async function checkTokens(collectionName: string) {
    const beds24 = new Beds24Connect();
    const headers = await beds24.getTokens();
    if (!headers?.remaining || !headers?.resetsIn) {
        return {
            success: false,
            message: 'Ошибка подключения к Beds24',
        };
    }

    if (collectionName == 'objects' && headers?.remaining < 10) {
        return {
            success: false,
            message: `Не хватает доступных запросов для синхронизации объектов. Число доступных запросов: ${headers?.remaining}. Пополнение через ${headers?.resetsIn} секунд.`,
        };
    }

    if (collectionName == 'prices' && headers?.remaining < 50) {
        return {
            success: false,
            message: `Не хватает доступных запросов для синхронизации ценовых диапазонов. Число доступных запросов: ${headers?.remaining}. Пополнение через ${headers?.resetsIn} секунд.`,
        };
    }

    if (collectionName == 'bookings' && headers?.remaining < 50) {
        return {
            success: false,
            message: `Не хватает доступных запросов для синхронизации бронирований. Число доступных запросов: ${headers?.remaining}. Пополнение через ${headers?.resetsIn} секунд.`,
        };
    }

    return {
        success: true,
        message: '',
    };
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get('type');
        const source: Beds24SyncJournalSource = searchParams.get('source') === 'daily' ? 'daily' : 'manual';

        if (!type) {
            return NextResponse.json({ error: 'Missing type parameter' }, { status: 400 });
        }

        const checkTokensResult = await checkTokens(type);

        if (!checkTokensResult.success) {
            if (type === 'bookings') {
                const db = await getDB();
                await writeBookingSyncJournal(db, {
                    createdAt: new Date(),
                    type: 'bookings',
                    source,
                    status: 'error',
                    error: checkTokensResult.message || 'Синхронизация броней не запущена',
                });
            }
            return NextResponse.json(checkTokensResult);
        }

        // Запускаем синхронизацию асинхронно (не ждём завершения)
        syncData(type, source).catch((error) => {
            console.error('Error during sync:', error);
        });

        return NextResponse.json({
            success: true,
            message: `Запущена синхронизация типа данных: "${type}"`
        });
    } catch (error) {
        console.error('Error in GET /api/sync:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

async function syncData(type: string, source: Beds24SyncJournalSource) {
    if (!SYNC_TYPES.has(type)) {
        console.error(`Unknown sync type: ${type}`);
        return;
    }

    const db = await getDB();
    const beds24 = new Beds24Connect();
    beds24.respectRateLimits = true;
    const bookingsArrivalFrom = type === 'bookings' ? bookingsSyncArrivalFrom() : undefined;
    const all: Record<string, unknown>[] = [];
    let nextPageIsExist = true;
    let page = 1;

    try {
        while (nextPageIsExist) {
            console.log('start sync');
            const pageResult = await fetchBeds24Page(beds24, type, page, bookingsArrivalFrom);
            all.push(...pageResult.data);
            nextPageIsExist = pageResult.nextPageExists;
            console.log(`Page ${page}: ${pageResult.data.length}. ${beds24.rateLimitStatus()}`);
            page++;
        }

        if (type === 'bookings' && bookingsArrivalFrom) {
            const merged = await mergeBookingsPreservingPast(db, all, bookingsArrivalFrom);
            console.log(
                `bookings sync finished from ${bookingsArrivalFrom}: kept ${merged.kept} earlier bookings, replaced ${merged.replaced}, skipped ${merged.skippedTotal}`,
            );
            await writeBookingSyncJournal(db, {
                createdAt: new Date(),
                type: 'bookings',
                source,
                status: 'success',
                arrivalFrom: bookingsArrivalFrom,
                incoming: all.length,
                kept: merged.kept,
                replaced: merged.replaced,
                preservedClosed: merged.preservedClosed,
                skippedTotal: merged.skippedTotal,
                skipped: merged.skipped,
            });
        } else {
            await replaceCollection(db, type, all);
            console.log(`${type} sync finished: replaced with ${all.length} documents`);
        }

        await db.collection('beds24').updateOne(
            {},
            { $set: { [type]: new Date() } },
            { upsert: true },
        );
    } catch (error) {
        if (type === 'bookings') {
            const message = error instanceof Error ? error.message : 'Ошибка синхронизации броней';
            await writeBookingSyncJournal(db, {
                createdAt: new Date(),
                type: 'bookings',
                source,
                status: 'error',
                arrivalFrom: bookingsArrivalFrom,
                incoming: all.length,
                error: message,
            });
        }
        throw error;
    }
}

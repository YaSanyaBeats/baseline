import { NextRequest, NextResponse } from 'next/server';
import type { AnyBulkWriteOperation } from 'mongodb';
import { Beds24Connect } from '@/lib/beds24/Beds24Connect';
import {
    createBookingSyncGuardContext,
    shouldSyncBooking,
    type BookingSyncDoc,
    type BookingSyncGuardContext,
} from '@/lib/beds24/bookingSyncGuard';
import { getDB } from '@/lib/db/getDB';

function getDocumentId(doc: Record<string, unknown>): number | null {
    const id = doc?.id;
    if (id == null) return null;
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
}

async function upsertDocumentsById(collectionName: string, data: Record<string, unknown>[]) {
    if (!data.length) return;

    const db = await getDB();
    const collection = db.collection(collectionName);
    const ops: AnyBulkWriteOperation[] = [];

    for (const doc of data) {
        const id = getDocumentId(doc);
        if (id == null) continue;
        ops.push({
            replaceOne: {
                filter: { id },
                replacement: doc,
                upsert: true,
            },
        });
    }

    if (ops.length) {
        await collection.bulkWrite(ops, { ordered: false });
    }
}

async function syncBookingsPage(
    data: Record<string, unknown>[],
    guard: BookingSyncGuardContext,
): Promise<{ upserted: number; skipped: number }> {
    if (!data.length) return { upserted: 0, skipped: 0 };

    const db = await getDB();
    const collection = db.collection('bookings');
    const ids = data.map((doc) => getDocumentId(doc)).filter((id): id is number => id != null);

    const existingById = new Map<number, BookingSyncDoc>();
    if (ids.length) {
        const existing = await collection
            .find({ id: { $in: ids } })
            .project({ id: 1, arrival: 1, departure: 1, propertyId: 1, unitId: 1, roomId: 1, roomID: 1 })
            .toArray();
        for (const doc of existing) {
            existingById.set(Number(doc.id), doc as BookingSyncDoc);
        }
    }

    const ops: AnyBulkWriteOperation[] = [];
    let skipped = 0;

    for (const doc of data) {
        const id = getDocumentId(doc);
        if (id == null) continue;

        const incoming = doc as BookingSyncDoc;
        const existing = existingById.get(id);

        if (
            !shouldSyncBooking(
                existing,
                incoming,
                guard.closedCache,
                guard.latestClosedByObjectId,
                guard.rawObjects,
            )
        ) {
            skipped += 1;
            continue;
        }

        ops.push({
            replaceOne: {
                filter: { id },
                replacement: doc,
                upsert: true,
            },
        });
    }

    if (ops.length) {
        await collection.bulkWrite(ops, { ordered: false });
    }

    return { upserted: ops.length, skipped };
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

        if (!type) {
            return NextResponse.json({ error: 'Missing type parameter' }, { status: 400 });
        }

        const checkTokensResult = await checkTokens(type);

        if (!checkTokensResult.success) {
            return NextResponse.json(checkTokensResult);
        }

        // Запускаем синхронизацию асинхронно (не ждём завершения)
        syncData(type).catch((error) => {
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

async function syncData(type: string) {
    const beds24 = new Beds24Connect();
    let nextPageIsExist = true;
    let page = 1;

    const db = await getDB();
    const bookingGuard = type === 'bookings' ? await createBookingSyncGuardContext(db) : null;
    let totalUpserted = 0;
    let totalSkipped = 0;

    while (nextPageIsExist) {
        let beds24data: Record<string, unknown>[] = [];
        console.log('start sync');

        if (type == 'objects') {
            const objects = await beds24.get('properties', {
                includeAllRooms: true,
                includeUnitDetails: true,
                page: page
            });

            beds24data = objects.data ?? [];
            nextPageIsExist = objects.pages.nextPageExists;
        } else if (type == 'prices') {
            const prices = await beds24.get('inventory/fixedPrices', {
                page: page
            });
            beds24data = prices.data ?? [];
            nextPageIsExist = prices.pages.nextPageExists;
        } else if (type == 'bookings') {
            const bookings = await beds24.get('bookings', {
                includeInvoiceItems: true,
                includeInfoItems: true,
                includeGuests: true,
                includeBookingGroup: true,
                arrivalTo: '2029-01-01',
                page: page
            });
            beds24data = bookings.data ?? [];
            nextPageIsExist = bookings.pages.nextPageExists;
        } else {
            console.error(`Unknown sync type: ${type}`);
            return;
        }

        console.log('Page: ', page);

        if (type === 'bookings' && bookingGuard) {
            const { upserted, skipped } = await syncBookingsPage(beds24data, bookingGuard);
            totalUpserted += upserted;
            totalSkipped += skipped;
            console.log(`Bookings page ${page}: upserted=${upserted}, skipped=${skipped}`);
        } else {
            await upsertDocumentsById(type, beds24data);
        }

        page++;
    }

    if (type === 'bookings') {
        console.log(`Bookings sync finished: upserted=${totalUpserted}, skipped=${totalSkipped}`);
    }

    const beds24Collection = db.collection('beds24');
    const now = new Date();

    await beds24Collection.updateOne(
        {},
        {
            $set: {
                [type]: now
            }
        },
        { upsert: true }
    );
}

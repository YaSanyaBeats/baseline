import { NextRequest, NextResponse } from 'next/server';
import { Beds24Connect } from '@/lib/beds24/Beds24Connect';
import { getDB } from '@/lib/db/getDB';

/** Широкое окно, чтобы повторный синк подтягивал годовые и уже начавшиеся брони. */
const BOOKINGS_ARRIVAL_FROM = '2020-01-01';
const BOOKINGS_ARRIVAL_TO = '2029-01-01';

const SYNC_TYPES = new Set(['objects', 'prices', 'bookings']);
const INSERT_CHUNK = 100;

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

function isNamespaceNotFound(error: unknown): boolean {
    const err = error as { code?: number; codeName?: string };
    return err?.code === 26 || err?.codeName === 'NamespaceNotFound';
}

/**
 * Полная замена коллекции снимком из Beds24.
 * Сначала пишем во временную коллекцию, затем drop старой через rename —
 * обрыв загрузки не оставляет пустую рабочую коллекцию.
 */
async function replaceCollection(collectionName: string, docs: Record<string, unknown>[]) {
    const db = await getDB();
    const incomingName = `${collectionName}__incoming`;
    const incoming = db.collection(incomingName);

    try {
        await incoming.drop();
    } catch (error) {
        if (!isNamespaceNotFound(error)) throw error;
    }

    if (docs.length === 0) {
        await db.createCollection(incomingName);
    } else {
        for (let i = 0; i < docs.length; i += INSERT_CHUNK) {
            await incoming.insertMany(docs.slice(i, i + INSERT_CHUNK), { ordered: false });
        }
    }

    await incoming.rename(collectionName, { dropTarget: true });
}

async function fetchBeds24Page(beds24: Beds24Connect, type: string, page: number) {
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
        arrivalFrom: BOOKINGS_ARRIVAL_FROM,
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
    if (!SYNC_TYPES.has(type)) {
        console.error(`Unknown sync type: ${type}`);
        return;
    }

    const beds24 = new Beds24Connect();
    beds24.respectRateLimits = true;
    const all: Record<string, unknown>[] = [];
    let nextPageIsExist = true;
    let page = 1;

    while (nextPageIsExist) {
        console.log('start sync');
        const pageResult = await fetchBeds24Page(beds24, type, page);
        all.push(...pageResult.data);
        nextPageIsExist = pageResult.nextPageExists;
        console.log(`Page ${page}: ${pageResult.data.length}. ${beds24.rateLimitStatus()}`);
        page++;
    }

    await replaceCollection(type, all);
    console.log(`${type} sync finished: replaced with ${all.length} documents`);

    const db = await getDB();
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

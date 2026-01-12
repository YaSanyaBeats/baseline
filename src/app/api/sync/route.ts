import { NextRequest, NextResponse } from 'next/server';
import { Beds24Connect } from '@/lib/beds24/Beds24Connect';
import { getDB } from '@/lib/db/getDB';

async function clearCollection(collectionName: string) {
    const db = await getDB();
    const collection = db.collection(collectionName);
    await collection.deleteMany({});
}

async function fillCollection(collectionName: string, data: any[]) {
    const db = await getDB();
    const collection = db.collection(collectionName);
    await collection.insertMany(data, { ordered: false });
}

async function checkTokens(collectionName: string) {
    const beds24 = new Beds24Connect();
    let headers = await beds24.getTokens();
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

        let checkTokensResult = await checkTokens(type);

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

    await clearCollection(type);

    while (nextPageIsExist) {
        let beds24data = [];
        console.log('start sync');
        
        if (type == 'objects') {
            let objects = await beds24.get('properties', {
                includeAllRooms: true,
                includeUnitDetails: true,
                page: page
            });

            beds24data = objects.data;
            nextPageIsExist = objects.pages.nextPageExists;
        } else if (type == 'prices') {
            let prices = await beds24.get('inventory/fixedPrices', {
                page: page
            });
            beds24data = prices.data;
            nextPageIsExist = prices.pages.nextPageExists;
        } else if (type == 'bookings') {
            let prices = await beds24.get('bookings', {
                includeInvoiceItems: true,
                includeInfoItems: true,
                includeGuests: true,
                includeBookingGroup: true,
                arrivalTo: '2029-01-01',
                page: page
            });
            beds24data = prices.data;
            nextPageIsExist = prices.pages.nextPageExists;
        }

        console.log('Page: ', page);
        await fillCollection(type, beds24data);

        page++;
    }
}

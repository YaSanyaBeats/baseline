import express, {Request, Response, NextFunction} from 'express';
import { Beds24Connect } from '../lib/beds24/Beds24Connect';
import bodyParser from 'body-parser';
import db from './../db/getDB';
import { processInBatches } from '../lib/utils/batches';

const router = express.Router();

async function clearCollection(collectionName: string) {
    const collection = db.collection(collectionName);
    collection.deleteMany({});
}

async function fillCollection(collectionName: string, data: any[]) {
    const collection = db.collection(collectionName);
    const result = await collection.insertMany(data, { ordered: false });
}

async function checkTokens(collectionName: string) {
    const beds24 = new Beds24Connect();
    let headers = await beds24.getTokens();
    if(!headers?.remaining || !headers?.resetsIn) {
        return {
            success: false,
            message: 'Ошибка подключения к Beds24',
        };
    }

    if(collectionName == 'objects' && headers?.remaining < 10) {
        return {
            success: false,
            message: `Не хватает доступных запросов для синхронизации объектов. Число доступных запросов: ${headers?.remaining}. Пополнение через ${headers?.resetsIn} секунд.`,
        };
    }

    if(collectionName == 'prices' && headers?.remaining < 50) {
        return {
            success: false,
            message: `Не хватает доступных запросов для синхронизации ценовых диапазонов. Число доступных запросов: ${headers?.remaining}. Пополнение через ${headers?.resetsIn} секунд.`,
        };
    }

    if(collectionName == 'bookings' && headers?.remaining < 50) {
        return {
            success: false,
            message: `Не хватает доступных запросов для синхронизации бронирований. Число доступных запросов: ${headers?.remaining}. Пополнение через ${headers?.resetsIn} секунд.`,
        };
    }

    return {
        success: true,
        message: '',
    }
}

router.get('/', async function(req: Request, res: Response, next: NextFunction) {
    if(!req.query.type) {
        return;
    }

    let checkTokensResult = await checkTokens(req.query.type as string);

    if(!checkTokensResult.success) {
        res.send(checkTokensResult);
        return;
    }

    res.send({
        success: true,
        message: `Запущена синхронизация типа данных: "${req.query.type}"`
    });

    const beds24 = new Beds24Connect();
    let nextPageIsExist = true;
    let page = 1;

    clearCollection(req.query.type as string);

    while(nextPageIsExist) {
        let beds24data = [];
        console.log('start sync');
        if(req.query.type == 'objects') {
            let objects = await beds24.get('properties', {
                includeAllRooms: true,
                includeUnitDetails: true,
                page: page
            });

            beds24data = objects.data;
            nextPageIsExist = objects.pages.nextPageExists;
        }
        else if(req.query.type == 'prices') {
            let prices = await beds24.get('inventory/fixedPrices', {
                page: page
            });
            beds24data = prices.data;
            nextPageIsExist = prices.pages.nextPageExists;
        }
        else if(req.query.type == 'bookings') {
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
        let bulkResult = fillCollection(req.query.type as string, beds24data);
        //console.log(bulkResult);
        
        page++;
    }
    
});

export default router;

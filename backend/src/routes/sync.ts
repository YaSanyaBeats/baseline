import express, {Request, Response, NextFunction} from 'express';
import { Beds24Connect } from '../lib/beds24/Beds24Connect';
import bodyParser from 'body-parser';
import db from './../db/getDB';
import { processInBatches } from '../lib/utils/batches';

const router = express.Router();

router.get('/', async function(req: Request, res: Response, next: NextFunction) {
    if(!req.query.type) {
        return;
    }

    const beds24 = new Beds24Connect();
    let nextPageIsExist = true;
    let newRows = 0;
    let editRows = 0;
    let deleteRows = 0;
    let page = 1;

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
        

        const collection = db.collection(req.query.type as string);
        const operations = beds24data.map((elem: any) => {
            return {
                replaceOne: {
                    filter: { id: elem.id },
                    replacement: elem,
                    upsert: true
                }
            }
        })
        
        console.log('Page: ', page);
        const bulkResult = await collection.bulkWrite(operations, { ordered: false });
        console.log(bulkResult);

        page++;
    }

    res.send(`Запущена синхронизация типа данных: "${req.query.type}"`);
    
});

export default router;

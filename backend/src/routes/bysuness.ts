import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';
import db from '../db/getDB';
import { ObjectId } from 'mongodb';

const router = express.Router();
router.use(bodyParser.json());

async function getBusynessPerRoom(objectID: number, room: any) {
    const bookings = db.collection('bookings');
    // Получаем текущую дату
    const now = new Date();
    now.setDate(1);

    // 12 месяцев назад
    const startDate = new Date(now);
    startDate.setMonth(now.getMonth() - 12);

    // 3 месяца вперёд
    const endDate = new Date(now);
    endDate.setMonth(now.getMonth() + 4);
    endDate.setDate(endDate.getDate() - 1);

    return new Promise(async (resolve, reject) => {
        const neededBookings = await bookings.find({
            propertyId: +objectID,
            unitId: +room.id,
            status: { $nin: ['inquiry'] },
            $and: [
                {arrival: { $lte: endDate.toISOString().split('T')[0] }},
                {departure: { $gte: startDate.toISOString().split('T')[0] }}
            ]
        }).toArray();

        const bookingsList = neededBookings.map((booking: any) => {
            // Вычисляем стоимость из invoiceItems
            let price = 0;
            if(booking?.invoiceItems?.length) {
                booking.invoiceItems.forEach((invoiceElem: any) => {
                    if(invoiceElem.type == 'charge' && invoiceElem.lineTotal > price) {
                        price = invoiceElem.lineTotal;
                    }
                })
            }

            // Вычисляем количество гостей
            let guestsCount = 0;
            if(booking?.numAdult) {
                guestsCount += booking?.numAdult;
            }
            if(booking?.numChild) {
                guestsCount += booking?.numChild;
            }

            return {
                id: booking.id,
                title: booking.title || '',
                firstName: booking.firstName || '',
                lastName: booking.lastName || '',
                status: booking.status || '',
                arrival: booking.arrival,
                departure: booking.departure,
                price: price,
                guestsCount: guestsCount
            };
        });

        resolve({
            roomID: room.id,
            roomName: room.name ? room.name : room.id,
            bookings: bookingsList
        });
    })
}

router.get('/', async function(req: Request, res: Response, next: NextFunction) {
    const objectID = req.query['objectID'];
    const userID = req.query['userID'];
    const objects = db.collection('objects');
    
    if(!objectID) {
        res.send('error');
        return;
    }

    const neededObject = await objects.find({
        id: +objectID
    }).toArray();

    
    let rooms = neededObject[0].roomTypes[0].units;
    if(userID) {
        const users = db.collection('users');
        const user = await users.findOne({
            '_id': new ObjectId(req.query['userID'] as string)
        });
        if(!user) {
            return;
        }
        
        const userObject = user.objects.find((userObject: any) => {
            return userObject.id == objectID;
        })
        rooms = rooms.filter((room: any) => {
            return userObject.rooms.includes(room.id);
        })
    }

    Promise.all(rooms.map((room: any) => {
        return getBusynessPerRoom(+objectID, room);
    })).then((result) => {
        res.send(result);
    });
})

export default router;
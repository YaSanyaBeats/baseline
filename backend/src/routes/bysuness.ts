import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';
import db from '../db/getDB';

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
        let result = [] as any[];
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            result.push({
                date: currentDate.toISOString().split('T')[0],
                busyness: false
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        const neededBookings = await bookings.find({
            propertyId: +objectID,
            unitId: +room.id,
            status: { $nin: ['black', 'inquiry'] },
            $and: [
                {arrival: { $lte: endDate.toISOString().split('T')[0] }},
                {departure: { $gte: startDate.toISOString().split('T')[0] }}
            ]
        }).toArray();

        neededBookings.forEach((booking: any) => {
            let arrival = booking.arrival;
            let departure = booking.departure;

            result = result.map((dateObject: any) => {
                return {
                    date: dateObject.date,
                    busyness: dateObject.busyness || (dateObject.date >= arrival && dateObject.date < departure),
                }
            })
        })        


        resolve({
            roomID: room.id,
            roomName: room.name ? room.name : room.id,
            busyness: result
        });
    })
}

router.get('/', async function(req: Request, res: Response, next: NextFunction) {
    const objectID = req.query['objectID'];
    const objects = db.collection('objects');
    

    if(!objectID) {
        res.send('error');
        return;
    }

    const neededObject = await objects.find({
        id: +objectID
    }).toArray();

    const rooms = neededObject[0].roomTypes[0].units;

    let busynessResult = {}


    Promise.all(rooms.map((room: any) => {
        return getBusynessPerRoom(+objectID, room);
    })).then((result) => {
        res.send(result);
    });
})

export default router;
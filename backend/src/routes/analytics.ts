import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';
import db from '../db/getDB';

const router = express.Router();
router.use(bodyParser.json());

async function getAnalyticsForObject(options: any, objectID: number) {
    let startMedian = options.startMedian * 0.01;
    let endMedian = options.endMedian * 0.01;
    return new Promise(async (resolve, reject) => {
        const objectCollection = db.collection('objects');
        const pricesCollection = db.collection('prices');
        const bookingCollection = db.collection('bookings');

        let objects = await objectCollection.find({
            id: objectID,
        }).toArray();
        let object = objects[0];

        let periods = await pricesCollection.find({
            propertyId: objectID,
        }).toArray();

        let bookings = await bookingCollection.find({
            propertyId: objectID,
        }).toArray();

        
        // Расскидываем бронирования по соответствующим периодам
        let bookingsPerPeriods = [] as any[];
        periods.forEach((period) => {
            let bookingPerPeriod = {
                id: objectID,
                firstNight: new Date(period.firstNight),
                lastNight: new Date(period.lastNight),
                bookings: [] as any[],
                busyness: 0,
                startMedianResult: null,
                endMedianResult: null
            };
            bookings.forEach((booking) => {
                booking.arrival = new Date(booking.arrival);
                booking.departure = new Date(booking.departure);
                booking.bookingTime = new Date(booking.bookingTime);
                if((booking.arrival <= bookingPerPeriod.lastNight) && (booking.departure >= bookingPerPeriod.firstNight)) {
                    bookingPerPeriod.bookings.push({
                        title: booking.title,
                        arrival: booking.arrival,
                        departure: booking.departure,
                        bookingTime: booking.bookingTime
                    });
                }
            })
            bookingPerPeriod.bookings.sort((a, b) => { return a - b; })
            bookingsPerPeriods.push(bookingPerPeriod);
        })

        // Считаем занятость
        bookingsPerPeriods.forEach((period, index) => {
            let unitsCount = object.roomTypes[0].units.length;
            let totalTime = (period.lastNight - period.firstNight) * unitsCount;

            let needDaysForStartMedian = totalTime * startMedian;
            let needDaysForEndMedian = totalTime * endMedian;

            let sumTime = 0;
            period.bookings.forEach((booking: any) => {
                let arrival = Math.max(booking.arrival, period.firstNight);
                let departure = Math.min(booking.departure, period.lastNight);

                sumTime += departure - arrival;

                // Тут же считаем окна бронирования (медианы)
                if(bookingsPerPeriods[index].startMedianResult === null && sumTime > needDaysForStartMedian) {
                    bookingsPerPeriods[index].startMedianResult = new Date(period.firstNight - booking.bookingTime);
                }

                if(bookingsPerPeriods[index].endMedianResult === null && sumTime > needDaysForEndMedian) {
                    bookingsPerPeriods[index].endMedianResult = new Date(period.firstNight - booking.bookingTime);
                }
            })

            bookingsPerPeriods[index].unitsCount = unitsCount;
            bookingsPerPeriods[index].totalDays = unitsCount;
            bookingsPerPeriods[index].busyness = sumTime / totalTime;
        })

        resolve(bookingsPerPeriods);
    })
}

router.get('/', async function(req: Request, res: Response, next: NextFunction) {
    if(!req?.query['objects[]']) {
        throw new Error('Не переданы объекты');
    }
    if(!req?.query['startMedian']) {
        throw new Error('Нет параметра "медиана от"');
    }
    if(!req?.query['endMedian']) {
        throw new Error('Нет параметра "медиана до"');
    }
    let objectFilterData = req?.query['objects[]'] as string[];
    if(typeof objectFilterData === "string") {
        objectFilterData = [objectFilterData];
    }
    let objectIDs = objectFilterData.map((e) => {return +e});

    
    const objectCollection = db.collection('objects');

    let objects = await objectCollection.find({
        id: { $in: objectIDs},
    }).toArray();

    
    Promise.all(objectIDs.map(getAnalyticsForObject.bind(null, {
        startMedian: req.query['startMedian'],
        endMedian: req.query['endMedian']
    }))).then((value) => {
        res.send(value);
    });

    
});

export default router;

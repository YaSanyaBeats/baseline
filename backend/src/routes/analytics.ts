import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';
import db from '../db/getDB';
import { all } from 'axios';

const router = express.Router();
router.use(bodyParser.json());

const removeDuplicates = (periods: any[]) => {
    const seen = new Set();
    const result = [] as any[];
    
    periods.forEach(period => {
        // Преобразуем объект в строку для сравнения
        const key = JSON.stringify(period);
        
        if (!seen.has(key)) {
            seen.add(key);
            result.push(period);
        }
    });
    
    return result;
};

async function getAnalyticsForObject(options: any, objectID: number) {
    let startMedian = options.startMedian * 0.01;
    let endMedian = options.endMedian * 0.01;
    let periods = options.periods;
    let startDate = options.startDate;
    let endDate = options.endDate;


    return new Promise(async (resolve, reject) => {
        const objectCollection = db.collection('objects');
        const pricesCollection = db.collection('prices');
        const bookingCollection = db.collection('bookings');

        let objects = await objectCollection.find({
            id: objectID,
        }).toArray();
        let object = objects[0];

        let bookings = await bookingCollection.find({
            propertyId: objectID,
        }).toArray();


        
        // Расскидываем бронирования по соответствующим периодам
        let bookingsPerPeriods = {
            all: [] as any[],
            rooms: {} as any
        };

        object.roomTypes[0].units.forEach((room: {id: any}) => {
            bookingsPerPeriods.rooms[room.id] = []
        })

        periods.forEach((period: any) => {
            let bookingPerPeriod = {
                id: objectID,
                firstNight: new Date(period.firstNight),
                lastNight: new Date(period.lastNight),
                bookings: [] as any[],
                busyness: 0,
                startMedianResult: null,
                endMedianResult: null
            };
            let bookingRoomsPerRoom = {} as any;
            bookings.forEach((booking) => {
                booking.arrival = new Date(booking.arrival);
                booking.departure = new Date(booking.departure);
                booking.bookingTime = new Date(booking.bookingTime);
                if((booking.arrival <= bookingPerPeriod.lastNight) && (booking.departure >= bookingPerPeriod.firstNight)) {
                    const newElem = {
                        title: booking.title,
                        arrival: booking.arrival,
                        departure: booking.departure,
                        bookingTime: booking.bookingTime
                    };
                    bookingPerPeriod.bookings.push(newElem);
                    if(!bookingRoomsPerRoom[booking.unitId]) {
                        bookingRoomsPerRoom[booking.unitId] = [];
                    }
                    bookingRoomsPerRoom[booking.unitId].push(newElem);
                }
            })
            bookingPerPeriod.bookings.sort((a, b) => { return a - b; })
            // bookingRoomsPerRoom.forEach((room) => {
            //     room.sort((a: any, b: any) => { return a - b; })
            // })

            bookingsPerPeriods.all.push(bookingPerPeriod);
            if(objectID == 110075) {
                console.log(bookingRoomsPerRoom);
            }
            for(const key in bookingRoomsPerRoom) {
                bookingsPerPeriods.rooms[key].push(bookingRoomsPerRoom[key]);
            }
            
        })

        // Считаем занятость
        bookingsPerPeriods.all.forEach((period, index) => {
            if(!object.roomTypes) {
                return;
            }
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
                if(bookingsPerPeriods.all[index].startMedianResult === null && sumTime > needDaysForStartMedian) {
                    bookingsPerPeriods.all[index].startMedianResult = new Date(period.firstNight - booking.bookingTime);
                }

                if(bookingsPerPeriods.all[index].endMedianResult === null && sumTime > needDaysForEndMedian) {
                    bookingsPerPeriods.all[index].endMedianResult = new Date(period.firstNight - booking.bookingTime);
                }
            })

            bookingsPerPeriods.all[index].unitsCount = unitsCount;
            bookingsPerPeriods.all[index].totalDays = unitsCount;
            bookingsPerPeriods.all[index].busyness = sumTime / totalTime;
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
    if(!req?.query['startDate']) {
        throw new Error('Нет параметра "Дата с"');
    }
    if(!req?.query['endDate']) {
        throw new Error('Нет параметра "Дата по"');
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

    const pricesCollection = db.collection('prices');
    let periods = await pricesCollection.find({
        $and: [
            {firstNight: { $lte: req.query['endDate'] }},
            {lastNight: { $gte: req.query['startDate']}}
        ]
    }).sort({
        firstNight: 1
    }).toArray();

    let normilizePeriods = periods.map((period) => {
        return {
            firstNight: period.firstNight,
            lastNight: period.lastNight
        }
    })
    normilizePeriods = removeDuplicates(normilizePeriods);



    Promise.all(objectIDs.map(getAnalyticsForObject.bind(null, {
        startMedian: req.query['startMedian'],
        endMedian: req.query['endMedian'],
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
        periods: normilizePeriods
    }))).then((value: any) => {
        console.log(value.length);
        res.send(value);
    });
});

export default router;

import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';
import db from '../db/getDB';
import { all } from 'axios';
import { Collection } from 'mongodb';
import pMap from 'p-map';

const router = express.Router();
router.use(bodyParser.json());
let count = 0;

function splitDateRange(
  startString: string,
  endString: string,
  step: number
): { firstNight: Date; lastNight: Date }[] {
    // Валидация входных данных
    if (step <= 0) {
        throw new Error('Step must be a positive number');
    }

    let startDate = new Date(startString);
    let endDate = new Date(endString);

    if (startDate > endDate) {
        throw new Error('startDate must be less than or equal to endDate');
    }

    const result: { firstNight: Date; lastNight: Date }[] = [];
    let currentStart = new Date(startDate);

    while (currentStart <= endDate) {
        // Определяем конец текущего промежутка
        const currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() + step - 1); // -1, потому что считаем ночи

        // Если конец промежутка выходит за endDate, ограничиваем его
        if (currentEnd > endDate) {
            currentEnd.setTime(endDate.getTime());
        }

        result.push({
            firstNight: new Date(currentStart),
            lastNight: new Date(currentEnd)
        });

        // Переходим к следующему промежутку
        currentStart.setDate(currentStart.getDate() + step);
    }

  return result;
}

async function checkRoomDisable(object: any, room: any, period: any) {

    const bookingCollection = db.collection('bookings');
    const countEarlyBookings = await bookingCollection.countDocuments({
        propertyId: object.id,
        unitId: room ? room.id : { $exists: true },
        status: { $nin: ['inquiry'] },
        $and: [
            {arrival: { $lt: period.lastNight }},
        ]
    });

    const countLateBookings = await bookingCollection.countDocuments({
        propertyId: object.id,
        unitId: room ? room.id : { $exists: true },
        status: { $nin: ['inquiry'] },
        $and: [
            {departure: { $gte: period.firstNight }},
        ]
    });

    return !countEarlyBookings || !countLateBookings;
}

async function getAnalyticsForPeriod(options: any, object: any, period: any, room: any = null, bookings: any[]) {
   
    let bookingPerPeriod = {
        firstNight: new Date(period.firstNight),
        lastNight: new Date(period.lastNight),
        bookings: [] as any[],
        busyness: 0,
        startMedianResult: 0,
        endMedianResult: 0,
        middlePrice: 0,
        error: false,
        disable: false
    };

    bookingPerPeriod.disable = await checkRoomDisable(object, room, period);

    let blackTime = 0;

    bookings.forEach((booking) => {
        booking.arrival = new Date(booking.arrival);
        booking.departure = new Date(booking.departure);
        booking.bookingTime = new Date(booking.bookingTime);

        let price = 0;
        if(booking?.invoiceItems?.length) {
            booking.invoiceItems.forEach((invoiceElem: any) => {
                if(invoiceElem.type == 'charge' && invoiceElem.lineTotal > price) {
                    price = invoiceElem.lineTotal;
                }
            })
        }

        const newBooking = {
            id: booking.id,
            firstName: booking.firstName,
            lastName: booking.lastName,
            status: booking.status,
            title: booking.title,
            arrival: booking.arrival,
            departure: booking.departure,
            bookingTime: booking.bookingTime,
            price: price,
            invoiceItems: booking.invoiceItems
        };

        bookingPerPeriod.bookings.push(newBooking);

        let arrival = Math.max(booking.arrival.getTime(), bookingPerPeriod.firstNight.getTime());
        let departure = Math.min(booking.departure.getTime(), bookingPerPeriod.lastNight.getTime());
        if(booking.status == 'black') {
            blackTime += departure - arrival;
        }
    })

    // Считаем занятость, окна бронирования и среднюю цену
    if(!object?.roomTypes || !object.roomTypes.length || !object.roomTypes[0].units.length) {
        return;
    }

    let unitsCount = object.roomTypes[0].units.length;
    if(room) {
        unitsCount = 1;
    }
    else {
        let promises = object.roomTypes[0].units.map((room: any) => {
            return checkRoomDisable(object, room, period);
        })
        const results = await Promise.all(promises);
        unitsCount = results.filter(value => !value).length;
    }
    let totalTime = (bookingPerPeriod.lastNight.getTime() - bookingPerPeriod.firstNight.getTime()) * unitsCount - blackTime;
    
    let startMedian = options.startMedian * 0.01;
    let endMedian = options.endMedian * 0.01;
    let needDaysForStartMedian = totalTime * startMedian;
    let needDaysForEndMedian = totalTime * endMedian;

    
    let sumTime = 0;
    let sumPrice = 0;
    let sumBookingDays = 0;
    bookingPerPeriod.bookings.forEach((booking, index) => {
        if(booking.status == 'black') {
            return;
        }

        let arrival = Math.max(booking.arrival.getTime(), bookingPerPeriod.firstNight.getTime());
        let departure = Math.min(booking.departure.getTime(), bookingPerPeriod.lastNight.getTime());

        sumTime += departure - arrival;

        let daysInPeriod = (departure - arrival) / (1000 * 60 * 60 * 24);
        let daysInBooking = (booking.departure.getTime() - booking.arrival.getTime()) / (1000 * 60 * 60 * 24);
        
        
        
        sumPrice += (booking.price / daysInBooking) * daysInPeriod;
        sumBookingDays += daysInPeriod;

        // Тут же считаем окна бронирования (медианы)
        if(bookingPerPeriod.startMedianResult === 0 && sumTime > needDaysForStartMedian) {
            bookingPerPeriod.startMedianResult = Math.round((bookingPerPeriod.firstNight.getTime() - booking.bookingTime.getTime()) / (1000 * 60 * 60 * 24));
        }

        if(bookingPerPeriod.endMedianResult === 0 && sumTime > needDaysForEndMedian) {
            bookingPerPeriod.endMedianResult = Math.round((bookingPerPeriod.firstNight.getTime() - booking.bookingTime.getTime()) / (1000 * 60 * 60 * 24));
        }
    })
    
    bookingPerPeriod.busyness = sumTime / totalTime;
    bookingPerPeriod.middlePrice = sumPrice / sumBookingDays;

    if(bookingPerPeriod.busyness && !bookingPerPeriod.middlePrice) {
        bookingPerPeriod.error = true;
    }

    if(bookingPerPeriod.busyness == 1 && bookingPerPeriod.middlePrice < 500) {
        bookingPerPeriod.error = true;
    }

    return bookingPerPeriod;

}

async function getRoomsAnalyticsForPeriod(options: any, object: any, periods: any, room: any, bookings: any[]) {
    const result = await pMap(periods, async (period: any) => {
        const filterBookings = bookings.filter(booking => {
            return  booking.arrival <= period.lastNight && 
                    booking.departure > period.firstNight && 
                    booking.unitId == room.id;
        });
        return await getAnalyticsForPeriod(options, object, period, room, filterBookings);
    }, { concurrency: 5 });

    const hasError = result.some(elem => elem?.error === true);

    return {
        roomID: room.id,
        roomName: room.name,
        roomAnalytics: result,
        error: hasError
    }
}

async function getAnalyticsForObject(options: any, object: any) {
    let periods = options.periods;

    const rooms: {id: number, name: string}[] = [];
    if(object.roomTypes) {
        object.roomTypes[0].units.forEach((room: {id: number, name: string}) => {
            rooms.push({
                id: room.id,
                name: room.name
            });
        })
    }

    const bookingCollection = db.collection('bookings');

    const bookings = await bookingCollection.find({
        propertyId: object.id,
    })
    .sort({ bookingTime: 1 })
    .toArray();

    return Promise.all([
        // Первый запрос: аналитика для объекта
        pMap(periods, async (period: any) => {
            const filterBookings = bookings.filter(booking => {
                return booking.arrival <= period.lastNight && booking.departure > period.firstNight;
            });
            return await getAnalyticsForPeriod(options, object, period, null, filterBookings);
        }, { concurrency: 5 }),
        // Второй запрос: аналитика по комнатам
        pMap(rooms, async (room) => {
            return await getRoomsAnalyticsForPeriod(options, object, periods, room, bookings);
        }, { concurrency: 5 }),

    ]).then(([objectResult, roomsResult]) => {
        const hasError = roomsResult.some((elem: any) => elem?.error === true);
        return {
            objectAnalytics: objectResult,
            roomsAnalytics: roomsResult,
            objectID: object.id,
            error: hasError,
        };
    })


    // return Promise.all(periods.map((period: any) => {
    //     return getAnalyticsForPeriod(options, object, period);
    // })).then((objectResult) => {
    //     Promise.all(rooms.map((room: any) => {
    //         return getRoomsAnalyticsForPeriod(options, object, periods, room);
    //     })).then((roomsResult) => {
            
    //     })
    // })
}

function getHeaderValues(periods: any, data: any) {
    let result = [] as any[];
    periods.map((period: any, index: number) => {
        let notDisableRoomsCount = 0;

        let resultPerPeriod = {
            firstNight: period.firstNight,
            lastNight: period.lastNight,
            middleBusyness: 0,
            middlePrice: 0
        }

        data.forEach((objectData: any) => {
            const object = objectData.objectAnalytics[index];
            if(object.disable) {
                return;
            }

            objectData.roomsAnalytics.forEach((roomData: any) => {
                const room = roomData.roomAnalytics[index];
                if(room.disable) {
                    return;
                }

                resultPerPeriod.middleBusyness += room.busyness;
                if(room.middlePrice) {
                    resultPerPeriod.middlePrice += room.middlePrice;
                }
                notDisableRoomsCount++;
            })
            
            
        })

        resultPerPeriod.middleBusyness /= notDisableRoomsCount;
        resultPerPeriod.middlePrice /= notDisableRoomsCount;

        result.push(resultPerPeriod);
    })
    return result;
}

function fillAverageCompareResult(data: any) {
    data.header.forEach((period: any, index: number) => {
        data.data.forEach((objectPerPeriod: any) => {
            objectPerPeriod.objectAnalytics[index].busynessGrow = objectPerPeriod.objectAnalytics[index].busyness > period.middleBusyness;
            objectPerPeriod.objectAnalytics[index].priceGrow = objectPerPeriod.objectAnalytics[index].middlePrice > period.middlePrice;
        })
    })
    return data;
}

function checkDeviations(median: number, value: number) {
    if(!value) {
        return false;
    }

    const deviation = ((value - median) / median) * 100;
    if(Math.abs(deviation) > 50) {
        return true;
    }

    return false;
}

function fillWarnings(data: any) {
    data.header.forEach((period: any, index: number) => {
        data.data.forEach((object: any) => {
            let prices = [] as number[];
            object.roomsAnalytics.forEach((room: any) => {
                if(room.roomAnalytics[index].middlePrice) {
                    prices.push(room.roomAnalytics[index].middlePrice);
                }
            })
            const median = prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)];
            object.roomsAnalytics.forEach((room: any) => {
                room.roomAnalytics[index].warning = checkDeviations(median, room.roomAnalytics[index].middlePrice);
            })
        })
    })

    data.data.forEach((object: any) => {
        object.objectAnalytics.forEach((objectPerPeriod: any) => {
            if(objectPerPeriod.busyness > 1) {
                objectPerPeriod.warning = true;
            }
        })
    })

    data.data.forEach((object: any) => {
        object.roomsAnalytics.forEach((room: any) => {
            const hasWarning = room.roomAnalytics.some((elem: any) => elem.warning === true);
            room.warning = hasWarning;
        })
    })

    data.data.forEach((object: any) => {
        const hasWarning = object.roomsAnalytics.some((elem: any) => elem.warning === true);
        object.warning = hasWarning;
    })

    return data;
}

function getPeriods(periodMode: string, startDateStr: string, endDateStr: string, step: number) {
    let periods = [] as any[];
    if(periodMode == 'beds24') {
        const periodsTemplate = [
            {firstNight: '12-25', lastNight: '01-15'},
            {firstNight: '01-16', lastNight: '01-31'},
            {firstNight: '02-01', lastNight: '02-28'},
            {firstNight: '03-01', lastNight: '03-31'},
            {firstNight: '04-01', lastNight: '04-30'},
            {firstNight: '05-01', lastNight: '05-31'},
            {firstNight: '06-01', lastNight: '06-30'},
            {firstNight: '07-01', lastNight: '07-31'},
            {firstNight: '08-01', lastNight: '08-31'},
            {firstNight: '09-01', lastNight: '10-14'},
            {firstNight: '10-15', lastNight: '10-31'},
            {firstNight: '11-01', lastNight: '11-19'},
            {firstNight: '11-20', lastNight: '12-09'},
            {firstNight: '12-10', lastNight: '12-24'},
        ];

        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        const startYear = startDate.getFullYear();
        const endYear = endDate.getFullYear() + 1;

        for (let year = startYear; year <= endYear; year++) {
            periodsTemplate.forEach((period, index) => {
                let firstNight = period.firstNight;
                let lastNight = period.lastNight;

                // Для первого периода шаблона — переход на следующий год
                let firstDate: Date;
                let lastDate: Date;

                if (index === 0) {
                    firstDate = new Date(`${year - 1}-${firstNight}`);
                    lastDate = new Date(`${year}-${lastNight}`);
                } else {
                    firstDate = new Date(`${year}-${firstNight}`);
                    lastDate = new Date(`${year}-${lastNight}`);
                }

                // Корректируем границы, если период выходит за [start, end]
                const adjustedFirst = (firstDate < startDate) ? startDate : firstDate;
                const adjustedLast = (lastDate > endDate) ? endDate : lastDate;

                // Если период пересекается с диапазоном — добавляем
                if (adjustedFirst <= endDate && adjustedLast >= startDate) {
                    periods.push({
                        firstNight: adjustedFirst.toISOString().split('T')[0], // YYYY-MM-DD
                        lastNight: adjustedLast.toISOString().split('T')[0]
                    });
                }
            });
        }
    }
    else if(periodMode == 'custom') {
        periods = splitDateRange(startDateStr, endDateStr, step);
        periods = periods.map((period) => {
            return {
                firstNight: period.firstNight.toISOString().split('T')[0],
                lastNight: period.lastNight.toISOString().split('T')[0],
            }
        })
    }
    else {
        throw new Error('PeriodMode передан некорректно');
    }

    return periods;
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
    if(!req?.query['step']) {
        throw new Error('Нет параметра step');
    }
    
    let objectFilterData = req?.query['objects[]'] as string[];
    if(typeof objectFilterData === "string") {
        objectFilterData = [objectFilterData];
    }

    let objectIDs = objectFilterData.map((e) => {return +e});

    let periods = getPeriods(
        req.query['periodMode'] as string, 
        req?.query['startDate']as string, 
        req?.query['endDate']as string,
        +req.query['step']
    );

    const objectCollection = db.collection('objects');
    let objects = await objectCollection.find({
        id: {$in: objectIDs}
    }).toArray();
    

    const objectsResult = await pMap(objects, async (object) => {
        const start = performance.now();
        const result = await getAnalyticsForObject({
            startMedian: req.query['startMedian'],
            endMedian: req.query['endMedian'],
            startDate: req.query['startDate'],
            endDate: req.query['endDate'],
            periods: periods,
            periodMode: req.query['periodMode'],
            step: req.query['step']
        }, object);
        const end = performance.now();
        console.log(end - start, `mc, for object: ${object.name}`);
        return result;
    }, { concurrency: 5 });

    let result = {
        header: getHeaderValues(periods, objectsResult),
        data: objectsResult
    } as any;
    result = fillAverageCompareResult(result);
    result = fillWarnings(result);

    res.send(result);

    // Promise.all(objectIDs.map(getAnalyticsForObject.bind(null, {
    //     startMedian: req.query['startMedian'],
    //     endMedian: req.query['endMedian'],
    //     startDate: req.query['startDate'],
    //     endDate: req.query['endDate'],
    //     periods: periods,
    //     periodMode: req.query['periodMode'],
    //     step: req.query['step']
    // }))).then((value: any) => {
    //     let result = {
    //         header: getHeaderValues(periods, value),
    //         data: value
    //     } as any;
    //     result = fillAverageCompareResult(result);
    //     result = fillWarnings(result);
    //     console.log(count, ' Total count');
    //     res.send(result);
    // });

    
});

export default router;

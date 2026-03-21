import { NextRequest, NextResponse } from 'next/server';
import type { Db } from 'mongodb';
import { getDB } from '@/lib/db/getDB';
import { buildClientObjectRows, shouldExpandToRoomTypesPerRawObject } from '@/lib/server/getObjects';

type AnalyticsTarget = { roomTypeId: number; rawObject: any };

async function findRawDocContainingRoomType(db: Db, roomTypeId: number): Promise<any | null> {
    for (const collName of ['objects', 'internalObjects'] as const) {
        const doc = await db.collection(collName).findOne({ 'roomTypes.id': roomTypeId });
        if (doc) {
            return doc;
        }
    }
    return null;
}

async function findRawDocByPropertyId(db: Db, propertyId: number): Promise<any | null> {
    for (const collName of ['objects', 'internalObjects'] as const) {
        const doc = await db.collection(collName).findOne({ id: propertyId });
        if (doc) {
            return doc;
        }
    }
    return null;
}

/**
 * Входные id → пары (roomTypeId, сырой документ objects/internalObjects).
 * — совпало с roomTypes[].id → один тип номера;
 * — совпало с id документа и развёртка по roomTypes → по target на каждый roomType.id;
 * — иначе одна строка (внутренний / неразвёрнутый объект).
 */
async function resolveAnalyticsTargets(db: Db, inputIds: number[]): Promise<AnalyticsTarget[]> {
    const targets: AnalyticsTarget[] = [];
    const seen = new Set<number>();

    const add = (roomTypeId: number, raw: any) => {
        if (seen.has(roomTypeId) || Number.isNaN(roomTypeId)) {
            return;
        }
        seen.add(roomTypeId);
        targets.push({ roomTypeId, rawObject: raw });
    };

    for (const raw of inputIds) {
        const id = Number(raw);
        if (Number.isNaN(id)) {
            continue;
        }

        const byRoomType = await findRawDocContainingRoomType(db, id);
        if (byRoomType) {
            add(id, byRoomType);
            continue;
        }

        const byProperty = await findRawDocByPropertyId(db, id);
        if (byProperty && shouldExpandToRoomTypesPerRawObject(byProperty)) {
            for (const rt of byProperty.roomTypes || []) {
                if (rt != null && typeof rt.id === 'number') {
                    add(rt.id, byProperty);
                }
            }
            continue;
        }

        if (byProperty) {
            add(id, byProperty);
        }
    }

    return targets;
}

/** Брони для одного roomType: в Mongo Beds24 — поле roomID или roomId. */
async function fetchBookingsByRoomTypeId(collection: any, roomTypeId: number): Promise<any[]> {
    return collection
        .find({
            $or: [{ roomID: roomTypeId }, { roomId: roomTypeId }],
        })
        .sort({ bookingTime: 1 })
        .toArray();
}

function normalizeAnalyticsBookings(raw: any[]): any[] {
    return raw.map((booking: any) => ({
        ...booking,
        arrival: new Date(booking.arrival),
        departure: new Date(booking.departure),
        bookingTime: new Date(booking.bookingTime),
        roomId: booking.roomId ?? booking.roomID,
        propertyId:
            booking.propertyId ??
            booking.propId ??
            booking.propertyID ??
            (typeof booking.property === 'number' ? booking.property : undefined),
    }));
}

/** Первая ночь по unitId; для броней только с roomId (roomType) — размазываем на все юниты строки. */
function getFirstNightsForRow(
    bookings: any[],
    isRoomTypeUiRow: boolean,
    rowId: number,
    unitIds: number[]
): Record<number, Date> {
    return bookings.reduce((acc: Record<number, Date>, booking: any) => {
        const arrival = booking.arrival instanceof Date ? booking.arrival : new Date(booking.arrival);
        const uid = booking.unitId;
        if (uid != null && !Number.isNaN(Number(uid))) {
            const k = Number(uid);
            if (!acc[k] || arrival < acc[k]) {
                acc[k] = arrival;
            }
            return acc;
        }
        if (
            isRoomTypeUiRow &&
            booking.roomId != null &&
            Number(booking.roomId) === rowId &&
            unitIds.length > 0
        ) {
            for (const id of unitIds) {
                if (!acc[id] || arrival < acc[id]) {
                    acc[id] = arrival;
                }
            }
        }
        return acc;
    }, {});
}

function splitDateRange(
    startString: string,
    endString: string,
    step: number
): { firstNight: Date; lastNight: Date }[] {
    if (step <= 0) {
        throw new Error('Step must be a positive number');
    }

    const startDate = new Date(startString);
    const endDate = new Date(endString);

    if (startDate > endDate) {
        throw new Error('startDate must be less than or equal to endDate');
    }

    const result: { firstNight: Date; lastNight: Date }[] = [];
    const currentStart = new Date(startDate);

    while (currentStart <= endDate) {
        const currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() + step - 1);

        if (currentEnd > endDate) {
            currentEnd.setTime(endDate.getTime());
        }

        result.push({
            firstNight: new Date(currentStart),
            lastNight: new Date(currentEnd)
        });

        currentStart.setDate(currentStart.getDate() + step);
    }

    return result;
}

function checkRoomDisable(options: any, object: any, room: any, period: any) {
    if (room) {
        return period.lastNight < options.firstNights[room.id];
    }

    const minDate: any = Object.values(options.firstNights).reduce((min: any, v: any) => {
        return min === null || v < min ? v : min;
    }, null);

    return period.lastNight < minDate;
}

/**
 * Название комнаты для попапа броней: строка юнита при детализации по комнате;
 * иначе по unitId в object.roomTypes (юниты) или по roomId (тип номера / listing).
 */
function resolveAnalyticsBookingRoomLabel(
    booking: any,
    object: any,
    room: { id?: number; name?: string } | null
): string {
    if (room?.name) {
        return String(room.name);
    }
    const units = object?.roomTypes;
    const uid = booking.unitId != null ? Number(booking.unitId) : null;
    const bRoomRaw = booking.roomId ?? booking.roomID;
    const bRoom = bRoomRaw != null ? Number(bRoomRaw) : null;
    const rowId = Number(object?.id);
    const propertyIdNum = Number(object?.propertyId ?? object?.id);
    if (bRoom != null && !Number.isNaN(bRoom) && rowId === bRoom && rowId !== propertyIdNum && object?.name) {
        return String(object.name);
    }
    if (uid != null && !Number.isNaN(uid)) {
        if (Array.isArray(units)) {
            const unit = units.find((r: any) => Number(r?.id) === uid);
            if (unit?.name) {
                return String(unit.name);
            }
        }
        return String(uid);
    }
    if (bRoom != null && !Number.isNaN(bRoom)) {
        return String(bRoom);
    }
    return '—';
}

async function getAnalyticsForPeriod(options: any, object: any, period: any, room: any = null, bookings: any[]) {
    const bookingPerPeriod = {
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

    bookingPerPeriod.disable = checkRoomDisable(options, object, room, period);

    let blackTime = 0;

    bookings.forEach((booking) => {
        let price = 0;
        if (booking?.invoiceItems?.length) {
            booking.invoiceItems.forEach((invoiceElem: any) => {
                if (invoiceElem.type == 'charge' && invoiceElem.lineTotal > price) {
                    price = invoiceElem.lineTotal;
                }
            });
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
            invoiceItems: booking.invoiceItems,
            referer: booking.referer,
            roomLabel: resolveAnalyticsBookingRoomLabel(booking, object, room),
        };

        bookingPerPeriod.bookings.push(newBooking);

        const arrival = Math.max(booking.arrival.getTime(), bookingPerPeriod.firstNight.getTime());
        const departure = Math.min(booking.departure.getTime(), bookingPerPeriod.lastNight.getTime());
        if (booking.status == 'black') {
            blackTime += departure - arrival;
        }
    });

    // Примечание: object здесь - это уже roomType из развёрнутой структуры
    // (после преобразования в API один roomType = один объект)
    if (!object?.roomTypes || !object.roomTypes.length) {
        return;
    }

    // object.roomTypes здесь содержит units (комнаты), а не roomTypes
    let unitsCount = object.roomTypes.length;
    
    if (room) {
        unitsCount = 1;
    } else {
        const promises = object.roomTypes.map((room: any) => {
            return checkRoomDisable(options, object, room, period);
        });
        const results = await Promise.all(promises);
        unitsCount = results.filter(value => !value).length;
    }

    /** Длина интервала анализа (мс). При нулевой длине ёмкость = 0. */
    const periodMs = Math.max(
        0,
        bookingPerPeriod.lastNight.getTime() - bookingPerPeriod.firstNight.getTime()
    );
    /**
     * Чёрные брони вычитаются из ёмкости. Перекрывающиеся/дубли black по одному юниту
     * давали blackTime > periodMs * unitsCount → отрицательный totalTime и заполняемость < 0.
     * Ограничиваем black сверху ёмкостью периода по активным юнитам.
     */
    const capacityMs = periodMs * unitsCount;
    const effectiveBlackTime =
        unitsCount > 0 && capacityMs > 0 ? Math.min(blackTime, capacityMs) : 0;
    const totalTime = Math.max(0, capacityMs - effectiveBlackTime);

    const startMedian = options.startMedian * 0.01;
    const endMedian = options.endMedian * 0.01;
    const needDaysForStartMedian = totalTime * startMedian;
    const needDaysForEndMedian = totalTime * endMedian;

    let sumTime = 0;
    let sumPrice = 0;
    let sumBookingDays = 0;
    bookingPerPeriod.bookings.forEach((booking) => {
        if (booking.status == 'black') {
            return;
        }

        const arrival = Math.max(booking.arrival.getTime(), bookingPerPeriod.firstNight.getTime());
        const departure = Math.min(booking.departure.getTime(), bookingPerPeriod.lastNight.getTime());

        sumTime += departure - arrival;

        const daysInPeriod = (departure - arrival) / (1000 * 60 * 60 * 24);
        const daysInBooking = (booking.departure.getTime() - booking.arrival.getTime()) / (1000 * 60 * 60 * 24);

        sumPrice += (booking.price / daysInBooking) * daysInPeriod;
        sumBookingDays += daysInPeriod;

        if (bookingPerPeriod.startMedianResult === 0 && sumTime > needDaysForStartMedian) {
            bookingPerPeriod.startMedianResult = Math.round((bookingPerPeriod.firstNight.getTime() - booking.bookingTime.getTime()) / (1000 * 60 * 60 * 24));
        }

        if (bookingPerPeriod.endMedianResult === 0 && sumTime > needDaysForEndMedian) {
            bookingPerPeriod.endMedianResult = Math.round((bookingPerPeriod.firstNight.getTime() - booking.bookingTime.getTime()) / (1000 * 60 * 60 * 24));
        }
    });

    const rawBusyness = totalTime > 0 ? sumTime / totalTime : 0;
    bookingPerPeriod.busyness = Math.min(1, Math.max(0, rawBusyness));
    bookingPerPeriod.middlePrice = sumBookingDays ? sumPrice / sumBookingDays : 0;

    if (bookingPerPeriod.busyness && !bookingPerPeriod.middlePrice) {
        bookingPerPeriod.error = true;
    }

    if (bookingPerPeriod.busyness == 1 && bookingPerPeriod.middlePrice < 500) {
        bookingPerPeriod.error = true;
    }

    return bookingPerPeriod;
}

async function getRoomsAnalyticsForPeriod(options: any, object: any, periods: any, room: any, bookings: any[]) {
    const propertyIdNum = Number(object.propertyId ?? object.id);
    const rowId = Number(object.id);
    const isRoomTypeUiRow = rowId !== propertyIdNum;

    const result = await Promise.all(periods.map(async (period: any) => {
        const filterBookings = bookings.filter((booking) => {
            const inPeriod =
                booking.arrival <= period.lastNight && booking.departure > period.firstNight;
            const byUnit = booking.unitId == room.id;
            const byRoomTypeOnly =
                isRoomTypeUiRow &&
                booking.unitId == null &&
                booking.roomId != null &&
                Number(booking.roomId) === rowId;
            return inPeriod && (byUnit || byRoomTypeOnly);
        });

        return await getAnalyticsForPeriod(options, object, period, room, filterBookings);
    }));

    const hasError = result.some(elem => elem?.error === true);

    return {
        roomID: room.id,
        roomName: room.name,
        roomAnalytics: result,
        error: hasError
    };
}

async function getAnalyticsForObject(
    sharedOptions: any,
    object: any,
    /** Уже отфильтрованные по roomTypeId (roomID / roomId) брони из коллекции bookings */
    rawBookingsForRoomType: any[]
) {
    // Копия на каждый объект: иначе Promise.all параллельно перезаписывает
    // sharedOptions.firstNights — все строки получают расчёт по последнему объекту.
    const options = { ...sharedOptions };
    const periods = options.periods;

    // object.roomTypes — юниты (комнаты) строки ClientObjectRow
    const rooms: { id: number; name: string }[] = [];
    if (object.roomTypes) {
        object.roomTypes.forEach((room: { id: number; name: string }) => {
            rooms.push({
                id: room.id,
                name: room.name
            });
        });
    }

    const propertyIdNum = Number(object.propertyId ?? object.id);
    const rowId = Number(object.id);
    const isRoomTypeUiRow = rowId !== propertyIdNum;
    const unitIdsForFirstNights = rooms.map((r) => r.id);

    const bookings = normalizeAnalyticsBookings(rawBookingsForRoomType);

    options.firstNights = getFirstNightsForRow(
        bookings,
        isRoomTypeUiRow,
        rowId,
        unitIdsForFirstNights
    );

    return Promise.all([
        Promise.all(periods.map(async (period: any) => {
            const filterBookings = bookings.filter((booking: any) => {
                const inPeriod =
                    booking.arrival <= period.lastNight && booking.departure > period.firstNight;
                const byUnit = rooms.some((room: any) => room.id === booking.unitId);
                const byRoomTypeOnly =
                    isRoomTypeUiRow &&
                    booking.unitId == null &&
                    booking.roomId != null &&
                    Number(booking.roomId) === rowId;
                return inPeriod && (byUnit || byRoomTypeOnly);
            });

            return await getAnalyticsForPeriod(options, object, period, null, filterBookings);
        })),
        Promise.all(rooms.map(async (room: any) => {
            return await getRoomsAnalyticsForPeriod(options, object, periods, room, bookings);
        }))
    ]).then(([objectResult, roomsResult]) => {
        const hasError = roomsResult.some((elem: any) => elem?.error === true);
        return {
            objectAnalytics: objectResult,
            roomsAnalytics: roomsResult,
            objectID: object.id,
            objectName: object.name,
            error: hasError,
        };
    });
}

function getHeaderValues(periods: any, data: any) {
    const result = [] as any[];
    periods.map((period: any, index: number) => {
        let notDisableRoomsCount = 0;
        let notZeroPriceRoomsCount = 0;

        const resultPerPeriod = {
            firstNight: period.firstNight,
            lastNight: period.lastNight,
            middleBusyness: 0,
            middlePrice: 0
        };

        data.forEach((objectData: any) => {
            const object = objectData.objectAnalytics[index];
            if (object.disable) {
                return;
            }

            objectData.roomsAnalytics.forEach((roomData: any) => {
                const room = roomData.roomAnalytics[index];
                if (room.disable) {
                    return;
                }
                resultPerPeriod.middleBusyness += room.busyness;
                if (room.middlePrice) {
                    resultPerPeriod.middlePrice += room.middlePrice;
                    notZeroPriceRoomsCount++;
                }
                notDisableRoomsCount++;
            });
        });

        if (notDisableRoomsCount > 0) {
            resultPerPeriod.middleBusyness /= notDisableRoomsCount;
        } else {
            resultPerPeriod.middleBusyness = 0;
        }
        if (notZeroPriceRoomsCount > 0) {
            resultPerPeriod.middlePrice /= notZeroPriceRoomsCount;
        } else {
            resultPerPeriod.middlePrice = 0;
        }

        result.push(resultPerPeriod);
    });
    return result;
}

function fillAverageCompareResult(data: any) {
    data.header.forEach((period: any, index: number) => {
        data.data.forEach((objectPerPeriod: any) => {
            objectPerPeriod.objectAnalytics[index].busynessGrow = objectPerPeriod.objectAnalytics[index].busyness > period.middleBusyness;
            objectPerPeriod.objectAnalytics[index].priceGrow = objectPerPeriod.objectAnalytics[index].middlePrice > period.middlePrice;
        });
    });
    return data;
}

function checkDeviations(median: number, value: number) {
    if (!value) {
        return false;
    }

    const deviation = ((value - median) / median) * 100;
    if (Math.abs(deviation) > 50) {
        return true;
    }

    return false;
}

function fillWarnings(data: any) {
    data.header.forEach((period: any, index: number) => {
        data.data.forEach((object: any) => {
            const prices = [] as number[];
            object.roomsAnalytics.forEach((room: any) => {
                if (room.roomAnalytics[index].middlePrice) {
                    prices.push(room.roomAnalytics[index].middlePrice);
                }
            });
            const median = prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)];
            object.roomsAnalytics.forEach((room: any) => {
                room.roomAnalytics[index].warning = checkDeviations(median, room.roomAnalytics[index].middlePrice);
            });
        });
    });

    data.data.forEach((object: any) => {
        object.objectAnalytics.forEach((objectPerPeriod: any) => {
            if (objectPerPeriod.busyness > 1) {
                objectPerPeriod.warning = true;
            }
        });
    });

    data.data.forEach((object: any) => {
        object.roomsAnalytics.forEach((room: any) => {
            const hasWarning = room.roomAnalytics.some((elem: any) => elem.warning === true);
            room.warning = hasWarning;
        });
    });

    data.data.forEach((object: any) => {
        const hasWarning = object.roomsAnalytics.some((elem: any) => elem.warning === true);
        object.warning = hasWarning;
    });

    return data;
}

function getPeriods(periodMode: string, startDateStr: string, endDateStr: string, step: number) {
    let periods = [] as any[];
    if (periodMode == 'beds24') {
        const periodsTemplate = [
            { firstNight: '12-25', lastNight: '01-15' },
            { firstNight: '01-16', lastNight: '01-31' },
            { firstNight: '02-01', lastNight: '02-28' },
            { firstNight: '03-01', lastNight: '03-31' },
            { firstNight: '04-01', lastNight: '04-30' },
            { firstNight: '05-01', lastNight: '05-31' },
            { firstNight: '06-01', lastNight: '06-30' },
            { firstNight: '07-01', lastNight: '07-31' },
            { firstNight: '08-01', lastNight: '08-31' },
            { firstNight: '09-01', lastNight: '10-14' },
            { firstNight: '10-15', lastNight: '10-31' },
            { firstNight: '11-01', lastNight: '11-19' },
            { firstNight: '11-20', lastNight: '12-09' },
            { firstNight: '12-10', lastNight: '12-24' },
        ];

        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        const startYear = startDate.getFullYear();
        const endYear = endDate.getFullYear() + 1;

        for (let year = startYear; year <= endYear; year++) {
            periodsTemplate.forEach((period, index) => {
                const firstNight = period.firstNight;
                const lastNight = period.lastNight;

                let firstDate: Date;
                let lastDate: Date;

                if (index === 0) {
                    firstDate = new Date(`${year - 1}-${firstNight}`);
                    lastDate = new Date(`${year}-${lastNight}`);
                } else {
                    firstDate = new Date(`${year}-${firstNight}`);
                    lastDate = new Date(`${year}-${lastNight}`);
                }

                const adjustedFirst = (firstDate < startDate) ? startDate : firstDate;
                const adjustedLast = (lastDate > endDate) ? endDate : lastDate;

                if (adjustedFirst <= endDate && adjustedLast >= startDate) {
                    periods.push({
                        firstNight: adjustedFirst,
                        lastNight: adjustedLast
                    });
                }
            });
        }
    } else if (periodMode == 'custom') {
        periods = splitDateRange(startDateStr, endDateStr, step);
        periods = periods.map((period) => {
            return {
                firstNight: period.firstNight,
                lastNight: period.lastNight,
            };
        });
    } else {
        throw new Error('PeriodMode передан некорректно');
    }

    return periods;
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;

        if (!searchParams.has('roomTypeIds[]') && !searchParams.has('objects[]')) {
            return NextResponse.json(
                { error: 'Не переданы roomTypeIds[] (или устаревший objects[])' },
                { status: 400 }
            );
        }
        if (!searchParams.has('startMedian')) {
            return NextResponse.json({ error: 'Нет параметра "медиана от"' }, { status: 400 });
        }
        if (!searchParams.has('endMedian')) {
            return NextResponse.json({ error: 'Нет параметра "медиана до"' }, { status: 400 });
        }
        if (!searchParams.has('startDate')) {
            return NextResponse.json({ error: 'Нет параметра "Дата с"' }, { status: 400 });
        }
        if (!searchParams.has('endDate')) {
            return NextResponse.json({ error: 'Нет параметра "Дата по"' }, { status: 400 });
        }
        if (!searchParams.has('step')) {
            return NextResponse.json({ error: 'Нет параметра step' }, { status: 400 });
        }

        const roomTypeIdParams = searchParams.has('roomTypeIds[]')
            ? searchParams.getAll('roomTypeIds[]')
            : searchParams.getAll('objects[]');

        const inputIds = roomTypeIdParams.map((e) => +e).filter((n) => !Number.isNaN(n));

        const periods = getPeriods(
            searchParams.get('periodMode') as string,
            searchParams.get('startDate') as string,
            searchParams.get('endDate') as string,
            +searchParams.get('step')!
        );

        const db = await getDB();
        const bookingCollection = db.collection('bookings');

        const targets = await resolveAnalyticsTargets(db, inputIds);
        if (targets.length === 0) {
            return NextResponse.json(
                { error: 'Не найдены объекты по переданным id roomTypes / property' },
                { status: 400 }
            );
        }

        const optionsPayload = {
            startMedian: +searchParams.get('startMedian')!,
            endMedian: +searchParams.get('endMedian')!,
            startDate: searchParams.get('startDate'),
            endDate: searchParams.get('endDate'),
            periods: periods,
            periodMode: searchParams.get('periodMode'),
            step: searchParams.get('step'),
        };

        const objectsResult = await Promise.all(
            targets.map(async ({ roomTypeId, rawObject }) => {
                const start = performance.now();
                const rows = buildClientObjectRows([rawObject], [], {}, {});
                const objectRow = rows.find((r) => r.id === roomTypeId);
                if (!objectRow) {
                    console.warn(`analytics: нет строки UI для roomTypeId=${roomTypeId}`);
                    return null;
                }
                const rawBookings = await fetchBookingsByRoomTypeId(bookingCollection, roomTypeId);
                const result = await getAnalyticsForObject(optionsPayload, objectRow, rawBookings);
                const end = performance.now();
                console.log(end - start, `mc, roomTypeId: ${roomTypeId} (${objectRow.name})`);
                return result;
            })
        );

        const filteredResults = objectsResult.filter((r): r is NonNullable<typeof r> => r != null);
        if (filteredResults.length === 0) {
            return NextResponse.json(
                { error: 'Не удалось сопоставить переданные id со строками аналитики' },
                { status: 400 }
            );
        }

        let result = {
            header: getHeaderValues(periods, filteredResults),
            data: filteredResults
        } as any;
        result = fillAverageCompareResult(result);
        result = fillWarnings(result);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in GET /api/analytics:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

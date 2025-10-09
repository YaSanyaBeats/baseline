export interface Room {
    id: number;
    name: string;
}

export interface Object {
    id: number;
    name: string;
    roomTypes: Room[];
}

export interface AnalyticsFilterData {
    objects: Object[];
    startMedian: number;
    endMedian: number;
}

export interface AnalyticsResult {
    bookings: {
        title: 'string',
        arrival: Date,
        departure: Date,
        bookingTime: Date
    }[],
    busyness: number,
    startMedianResult: Date,
    endMedianResult: Date,
    firstNight: Date,
    lastNight: Date,
}
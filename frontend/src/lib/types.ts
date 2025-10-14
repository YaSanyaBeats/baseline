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
    id: number;
    bookings: {
        title: 'string',
        arrival: string,
        departure: string,
        bookingTime: string
    }[],
    busyness: number,
    startMedianResult: string,
    endMedianResult: string,
    firstNight: string,
    lastNight: string,
}

export interface OptionsFormData {
  excludeObjects: Object[];
  excludeSubstr: string;
}
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
    startDate: string;
    endDate: string;
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

export interface FullAnalyticsResult {
    all: AnalyticsResult[],
    rooms: any  // eslint-disable-line @typescript-eslint/no-explicit-any
}


export interface OptionsFormData {
  excludeObjects: Object[];
  excludeSubstr: string;
}
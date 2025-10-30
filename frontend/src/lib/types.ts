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
    periodMode: string;
    step: number;
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
    middlePrice: number
}

export interface RoomAnalyticsResult {
    roomAnalytics: AnalyticsResult[],
    roomID: number,
    roomName: string
}

export interface FullAnalyticsResult {
    objectAnalytics: AnalyticsResult[],
    objectID: number,
    roomsAnalytics: RoomAnalyticsResult[]
}

export interface OptionsFormData {
  excludeObjects: Object[];
  excludeSubstr: string;
}
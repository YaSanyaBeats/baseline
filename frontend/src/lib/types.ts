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
    startMedian: string;
    endMedian: string;
    startDate: string;
    endDate: string;
    periodMode: string;
    step: string;
}

export interface AnalyticsBooking {
    id: number,
    firstName: string,
    lastName: string,
    status: string,
    title: string,
    arrival: string,
    departure: string,
    bookingTime: string,
    price: number
}

export interface AnalyticsResult {
    id: number;
    bookings: AnalyticsBooking[],
    busyness: number,
    startMedianResult: string,
    endMedianResult: string,
    firstNight: string,
    lastNight: string,
    middlePrice: number,
    error: boolean,
    warning: boolean,
    busynessGrow: boolean,
    priceGrow: boolean
}

export interface RoomAnalyticsResult {
    roomAnalytics: AnalyticsResult[],
    roomID: number,
    roomName: string,
    error: boolean,
    warning: boolean
}

export interface FullAnalyticsResult {
    objectAnalytics: AnalyticsResult[],
    objectID: number,
    roomsAnalytics: RoomAnalyticsResult[],
    error: boolean,
    warning: boolean
}

export interface AnalyticsHeader {
    firstNight: string,
    lastNight: string,
    middleBusyness: number,
    middlePrice: number
}

export interface AnalyticsResponse {
    header: AnalyticsHeader[],
    data: FullAnalyticsResult[]
}

export interface OptionsFormData {
  excludeObjects: Object[];
  excludeSubstr: string;
}

export interface SyncResponse {
    success: boolean;
    message: string;
}
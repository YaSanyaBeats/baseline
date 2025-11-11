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

/*
firstName: booking.firstName,
            lastName: booking.lastName,
            status: booking.status,
            title: booking.title,
            arrival: booking.arrival,
            departure: booking.departure,
            bookingTime: booking.bookingTime,
            price: price,
            invoiceItems: booking.invoiceItems
*/

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
    warning: boolean
}

export interface RoomAnalyticsResult {
    roomAnalytics: AnalyticsResult[],
    roomID: number,
    roomName: string,
    warning: boolean
}

export interface FullAnalyticsResult {
    objectAnalytics: AnalyticsResult[],
    objectID: number,
    roomsAnalytics: RoomAnalyticsResult[],
    warning: boolean
}

export interface OptionsFormData {
  excludeObjects: Object[];
  excludeSubstr: string;
}

export interface SyncResponse {
    success: boolean;
    message: string;
}
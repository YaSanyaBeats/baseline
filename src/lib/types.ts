export interface Room {
    id: number;
    name: string;
    // Для админа: список пользователей, у которых есть доступ к этой комнате
    accessUsers?: string[];
}

export interface Object {
    id: number;
    name: string;
    roomTypes: Room[];
}

export interface Booking {
    id: number,
    firstName: string,
    lastName: string,
    status: string,
    title: string,
    arrival: string,
    departure: string,
    bookingTime: string,
    invoiceItems: InvoiceItem[]
}

export interface InvoiceItem {
    id: number,
    type: string,
    lineTotal: number,
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
    priceGrow: boolean,
    disable: boolean
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
    warning: boolean,
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

export interface User {
    _id?: string,
    login: string,
    role: 'admin' | 'owner' | 'accountant',
    name: string,
    password: string,
    objects: UserObject[],
    email?: string,
    phone?: string,
    bankName?: string,
    accountNumber?: string,
    accountType?: 'basic' | 'premium',
    reportLink?: string
}

export interface UserObject {
    id: number,
    rooms: number[]
}

export interface CommonResponse {
    success: boolean;
    message: string;
}

export interface BusynessRow {
    busyness: BusynessItem[],
    roomID: number,
    roomName: string
}

export interface RoomBookings {
    roomID: number,
    roomName: string,
    bookings: BusynessBookingInfo[]
}

export interface BusynessBookingInfo {
    id: number,
    title: string,
    firstName: string,
    lastName: string,
    status: string,
    arrival: string,
    departure: string,
    price: number,
    guestsCount: number
}

export interface BusynessItem {
    date: string,
    busyness: 'free' | 'busyness' | 'black',
    booking?: BusynessBookingInfo | null
}

export interface Report {
    _id?: string,
    reportLink: string,
    reportMonth: number, // 1-12
    reportYear: number,
    ownerId: string, // ID пользователя-владельца отчёта
    ownerName?: string, // Имя пользователя-владельца (для удобства)
    accountantId: string, // ID пользователя-бухгалтера, который добавил отчёт
    accountantName?: string, // Имя бухгалтера (для удобства)
    createdAt?: Date
}


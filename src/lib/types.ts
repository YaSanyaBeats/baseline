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
    invoiceItems: InvoiceItem[],
    propertyId?: number,
    unitId?: number
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
    price: number,
    referer?: string
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
    objectId: number, // ID объекта
    roomIds?: number[], // ID комнат
    ownerId?: string, // ID пользователя-владельца отчёта (устаревшее поле, не используется)
    ownerName?: string, // Имя пользователя-владельца (устаревшее поле, не используется)
    accountantId: string, // ID пользователя-бухгалтера, который добавил отчёт
    accountantName?: string, // Имя бухгалтера (для удобства)
    createdAt?: Date
}

export type ExpenseStatus = 'draft' | 'confirmed';

/** Вложение к расходу/доходу: изображения, документы, таблицы */
export interface AccountancyAttachment {
    name: string;   // Имя файла
    url: string;    // URL для скачивания/просмотра
}

export interface Expense {
    _id?: string;
    objectId: number;              // ID объекта
    roomId?: number;               // ID комнаты (опционально)
    bookingId?: number;            // ID бронирования (опционально)
    category: string;              // Категория расхода
    amount: number;                // Сумма расхода
    date: Date;                    // Дата расхода
    comment?: string;              // Комментарий
    status: ExpenseStatus;         // Черновик / Подтверждён
    attachments?: AccountancyAttachment[];  // До 5 файлов, макс. 20 МБ каждый
    accountantId: string;          // ID бухгалтера/админа, создавшего запись
    accountantName?: string;       // Имя бухгалтера
    createdAt?: Date;              // Дата создания записи
}

export interface Income {
    _id?: string;
    objectId: number;              // ID объекта
    roomId?: number;               // ID комнаты (опционально)
    bookingId?: number;            // ID бронирования (опционально)
    date: Date;                    // Дата дохода
    amount: number;                // Сумма дохода
    category: string;              // Категория дохода
    attachments?: AccountancyAttachment[];  // До 5 файлов, макс. 20 МБ каждый
    accountantId: string;          // ID бухгалтера/админа, создавшего запись
    accountantName?: string;       // Имя бухгалтера
    createdAt?: Date;              // Дата создания записи
}

export type AccountancyCategoryType = 'expense' | 'income';

export interface AccountancyCategory {
    _id?: string;
    name: string;
    type: AccountancyCategoryType;
    createdAt?: Date;
}

export type AuditLogAction = 'create' | 'update' | 'delete';

export type AuditLogEntity = 'expense' | 'income' | 'report' | 'user' | 'category' | 'booking' | 'other';

export interface AuditLog {
    _id?: string;
    entity: AuditLogEntity;       // Тип сущности (расход, доход, отчёт и т.д.)
    entityId?: string;             // ID изменённой сущности
    action: AuditLogAction;        // Тип действия (создание, обновление, удаление)
    userId: string;                // ID пользователя, выполнившего действие
    userName: string;              // Имя пользователя
    userRole: string;              // Роль пользователя
    description: string;           // Описание действия
    oldData?: any;                 // Старые данные (для update и delete)
    newData?: any;                 // Новые данные (для create и update)
    metadata?: {                   // Дополнительная информация
        objectId?: number;
        bookingId?: number;
        category?: string;
        amount?: number;
        ip?: string;
        userAgent?: string;
    };
    timestamp: Date;               // Дата и время действия
}



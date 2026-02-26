/** Уровень комфорта комнаты (из objectRoomMetadata) */
export type RoomLevel = 'economy' | 'comfort' | 'premium' | 'lux';

/** Тип объекта: апартаменты или вилла */
export type ObjectType = 'apartments' | 'villa';

export interface Room {
    id: number;
    name: string;
    // Для админа: список пользователей, у которых есть доступ к этой комнате
    accessUsers?: string[];
    // Метаданные из objectRoomMetadata (редактируемые)
    bedrooms?: number;
    bathrooms?: number;
    livingRoomSofas?: number;
    kitchen?: 'yes' | 'no';
    level?: RoomLevel;
    commissionSchemeId?: 1 | 2 | 3 | 4;
    /** Стоимость за интернет в месяц (число) */
    internetCostPerMonth?: number;
}

export interface Object {
    id: number;
    name: string;
    roomTypes: Room[];
    // Метаданные из objectRoomMetadata (редактируемые)
    district?: string;
    objectType?: ObjectType;
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
export type IncomeStatus = 'draft' | 'confirmed';

/** Вложение к расходу/доходу: изображения, документы, таблицы */
export interface AccountancyAttachment {
    name: string;   // Имя файла
    url: string;    // URL для скачивания/просмотра
}

/** Контрагент: привязка к объекту и комнатам */
export interface Counterparty {
    _id?: string;
    name: string;                  // Имя контрагента
    roomLinks: UserObject[];       // Привязка к комнатам: { id: objectId, rooms: roomIds[] }
    comment?: string;              // Комментарий
    createdAt?: Date;
}

/** Тип кэшфлоу: учётный центр движения средств */
export type CashflowType = 'company' | 'employee' | 'room' | 'object' | 'premium' | 'other';

/** Кэшфлоу: подотчёт / учётный центр для доходов и расходов */
export interface Cashflow {
    _id?: string;
    name: string;                  // Название (например: «Компания», «Зарплата Иванов», «Комната А-101»)
    type: CashflowType;            // Тип кэшфлоу
    roomLinks: UserObject[];       // Привязка к комнатам (для type room/object); для company/premium — пусто
    userId?: string;               // ID пользователя (для type employee, опционально)
    counterpartyIds?: string[];    // Привязка к контрагентам
    comment?: string;              // Комментарий
    createdAt?: Date;
}

/** Признак и источник автосозданной записи (при ручном изменении сбрасывается) */
export interface AutoCreatedMeta {
    ruleId?: string;               // ID правила из конструктора
}

export interface Expense {
    _id?: string;
    objectId: number;              // ID объекта
    roomId?: number;               // ID комнаты (опционально)
    bookingId?: number;            // ID бронирования (опционально)
    counterpartyId?: string;       // ID контрагента (опционально)
    cashflowId?: string;           // ID кэшфлоу — учётный центр (опционально)
    category: string;              // Категория расхода
    amount: number;                // Стоимость за единицу
    quantity?: number;            // Количество (по умолчанию 1 для старых записей)
    date: Date;                    // Дата расхода
    comment?: string;              // Комментарий
    status: ExpenseStatus;         // Черновик / Подтверждён
    reportMonth?: string;          // Месяц отчёта в формате YYYY-MM
    attachments?: AccountancyAttachment[];  // До 5 файлов, макс. 20 МБ каждый
    accountantId: string;          // ID бухгалтера/админа, создавшего запись
    accountantName?: string;       // Имя бухгалтера
    createdAt?: Date;              // Дата создания записи
    /** Запись создана автоучётом; при ручном редактировании сбрасывается */
    autoCreated?: AutoCreatedMeta | null;
}

export interface Income {
    _id?: string;
    objectId: number;              // ID объекта
    roomId?: number;               // ID комнаты (опционально)
    bookingId?: number;            // ID бронирования (опционально)
    cashflowId?: string;           // ID кэшфлоу — учётный центр (опционально)
    date: Date;                    // Дата дохода
    amount: number;                // Стоимость за единицу
    quantity?: number;            // Количество (по умолчанию 1 для старых записей)
    category: string;              // Категория дохода
    comment?: string;              // Комментарий
    status: IncomeStatus;          // Черновик / Подтверждён
    reportMonth?: string;          // Месяц отчёта в формате YYYY-MM
    attachments?: AccountancyAttachment[];  // До 5 файлов, макс. 20 МБ каждый
    accountantId: string;          // ID бухгалтера/админа, создавшего запись
    accountantName?: string;       // Имя бухгалтера
    createdAt?: Date;              // Дата создания записи
    /** Запись создана автоучётом; при ручном редактировании сбрасывается */
    autoCreated?: AutoCreatedMeta | null;
}

/** Период применения правила: на бронь целиком или по одному на каждый месяц брони */
export type AutoAccountingPeriod = 'per_booking' | 'per_month';

/** Откуда брать стоимость для автоучёта */
export type AutoAccountingAmountSource = 'manual' | 'booking_price' | 'internet_cost' | 'category';

/** Правило автоучёта: при добавлении брони создавать расход/доход по условиям */
export interface AutoAccountingRule {
    _id?: string;
    /** Тип записи */
    ruleType: 'expense' | 'income';
    /** ID объекта или 'all' для всех объектов */
    objectId: number | 'all';
    /** ID комнаты или 'all' для всех комнат объекта (имеет смысл при заданном objectId) */
    roomId?: number | 'all';
    /** Категория расхода/дохода */
    category: string;
    /** Количество (например 1 для уборки) */
    quantity: number;
    /** Сумма за единицу (при amountSource === 'manual') */
    amount?: number;
    /** Откуда брать стоимость: вручную, из брони (price), из метаданных комнаты (интернет), из категории */
    amountSource?: AutoAccountingAmountSource;
    /** per_booking — одна запись на бронь; per_month — по одному на каждый месяц проживания */
    period: AutoAccountingPeriod;
    /** Порядок применения правил */
    order: number;
    createdAt?: Date;
}

export type AccountancyCategoryType = 'expense' | 'income';

/** Делимость: "/2", "/3", "неделимый" */
export type CategoryDivisibility = '/2' | '/3' | 'неделимый';

/** Чекин / чекаут */
export type CategoryCheckInOut = 'checkin' | 'checkout';

export interface AccountancyCategory {
    _id?: string;
    name: string;
    type: AccountancyCategoryType;
    parentId?: string | null;           // ID родительской категории (null = корневая)
    order?: number;                     // Порядок отображения среди siblings
    unit?: string;                      // Единица измерения
    divisibility?: CategoryDivisibility; // Делимость
    pricePerUnit?: number;              // Цена за единицу
    attributionDate?: string;           // Дата отнесения (ISO)
    isAuto?: boolean;                   // Авто / не авто
    checkInOut?: CategoryCheckInOut;    // Чекин / чекаут
    reportingPeriod?: string;           // Отчётный период (дата, ISO)
    createdAt?: Date;
}

export type AuditLogAction = 'create' | 'update' | 'delete';

export type AuditLogEntity = 'expense' | 'income' | 'report' | 'user' | 'category' | 'booking' | 'cashflow' | 'other';

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



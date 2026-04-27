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
    /** MongoDB _id контрагента — провайдер интернета для комнаты */
    internetProviderCounterpartyId?: string;
    /** Стоимость за интернет в месяц (число) */
    internetCostPerMonth?: number;
}

export interface Object {
    id: number;
    name: string;
    /** ID property в Beds24 / внутреннего документа (для броней, метаданных, API). Для строки roomType совпадает с id документа в Mongo. */
    propertyId: number;
    propertyName?: string;  // Имя property для группировки (для развёрнутых roomTypes)
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
    /** Может отсутствовать в ответе Beds24/API для части броней. */
    invoiceItems?: InvoiceItem[],
    propertyId?: number,
    unitId?: number,
    /** Beds24: id комнаты/листинга; в Mongo может быть вместо или вместе с unitId */
    roomId?: number,
    roomID?: number,
    /** Канал OTA / источник (Beds24). */
    referer?: string,
    refererEditable?: string,
    channel?: string,
    /** Гости Beds24; для подписи групп в бухгалтерии. */
    numAdult?: number,
    numChild?: number,
    /** Примечания/комментарий к брони (Beds24 / Mongo). */
    comments?: string,
    notes?: string,
    message?: string,
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
    referer?: string,
    /** Комната / юнит (подпись с бэкенда аналитики) */
    roomLabel?: string,
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
    /** Имя строки объекта/roomType на момент расчёта (для отображения, если нет в ObjectsProvider) */
    objectName?: string,
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
    reportLink?: string,
    /** Доступ к вкладке «Кешфлоу»: свои расходы/доходы, только черновики */
    hasCashflow?: boolean,
}

export interface UserObject {
    id: number,
    rooms: number[]
}

export interface CommonResponse {
    success: boolean;
    message: string;
    /** Код ошибки для клиента (например запрет дублей по категории) */
    code?: string;
    /** ID созданной сущности (например расхода после POST) */
    id?: string;
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

/** Тип фильтра в правиле кэшфлоу */
export type CashflowRuleFilterType =
    | 'rooms'
    | 'metadata'
    | 'counterparty'
    | 'category'
    | 'roomMetadata'
    | 'booking'
    | 'bookingDate'
    | 'recordDate'
    | 'amount'
    | 'reportMonth'
    | 'status'
    | 'recordType';

/** Оператор сравнения для чисел и дат */
export type CashflowRuleCompareOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'after' | 'before';

/** Один фильтр в правиле */
export interface CashflowRuleFilter {
    id: string;
    type: CashflowRuleFilterType;
    /** rooms: привязка объект → комнаты */
    roomLinks?: UserObject[];
    /** metadata: поле (district, objectType) и значение */
    metadataField?: string;
    metadataValue?: string;
    /** counterparty */
    counterpartyId?: string;
    sourceOrRecipient?: 'source' | 'recipient' | 'both';
    /** category: названия категорий (расход/доход) */
    categoryNames?: string[];
    /** roomMetadata: поле комнаты (bedrooms, bathrooms, level, kitchen и т.д.) */
    roomMetadataField?: string;
    roomMetadataOperator?: CashflowRuleCompareOperator;
    roomMetadataValue?: string | number;
    roomMetadataValueTo?: string | number; // для between
    /** booking: есть привязка к брони (true/false) или список ID броней */
    hasBooking?: boolean;
    bookingIds?: number[];
    /** bookingDate: дата брони (arrival/departure), нужны данные броней при расчёте */
    bookingDateField?: 'arrival' | 'departure';
    bookingDateOperator?: CashflowRuleCompareOperator;
    bookingDateValue?: string;
    bookingDateValueTo?: string;
    /** recordDate: дата записи расхода/дохода */
    recordDateOperator?: CashflowRuleCompareOperator;
    recordDateValue?: string;
    recordDateValueTo?: string;
    /** amount: сумма (количество × цена) */
    amountOperator?: CashflowRuleCompareOperator;
    amountValue?: number;
    amountValueTo?: number;
    /** reportMonth: месяц отчёта YYYY-MM */
    reportMonth?: string;
    reportMonths?: string[];
    /** status: черновик / подтверждён */
    recordStatus?: 'draft' | 'confirmed';
    /** recordType: только расход / только доход */
    recordType?: 'expense' | 'income';
}

/** Логика между фильтрами правила: И / ИЛИ */
export type CashflowRuleFilterLogic = 'and' | 'or';

/** Знак баланса правила: плюс — сумма по модулю, минус — минус сумма по модулю */
export type CashflowRuleBalanceSign = 'plus' | 'minus';

/** Правило кэшфлоу: набор фильтров для отбора расходов/доходов и подсчёта баланса */
export interface CashflowRule {
    _id?: string;
    name: string;
    filterLogic: CashflowRuleFilterLogic;
    filters: CashflowRuleFilter[];
    /** Знак баланса: plus — все суммы складываются по модулю, minus — отнимаются по модулю */
    balanceSign: CashflowRuleBalanceSign;
    /** @deprecated используйте balanceSign (true → 'plus', false → 'minus') */
    positiveSign?: boolean;
    createdAt?: Date;
}

/** Признак и источник автосозданной записи (при ручном изменении сбрасывается) */
export interface AutoCreatedMeta {
    ruleId?: string;               // ID правила из конструктора
}

/** Значение поля «От кого»/«Кому»: "room:objectId:roomId", "room:from_booking" (только в правилах автоучёта), "cp:…", "user:…", "cf:…" */
export type SourceRecipientValue = string;

export interface Expense {
    _id?: string;
    objectId: number;              // ID объекта
    roomId?: number;               // ID комнаты (опционально)
    bookingId?: number;            // ID бронирования (опционально)
    counterpartyId?: string;       // ID контрагента (опционально)
    /** От кого: объект+комната (room:objectId:roomId) или контрагент (cp:id) */
    source?: SourceRecipientValue;
    /** Кому: объект+комната (room:objectId:roomId) или контрагент (cp:id) */
    recipient?: SourceRecipientValue;
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
    /** ID родительского расхода (Mongo), если запись — подтранзакция при делимости */
    parentExpenseId?: string | null;
    /** ID родительского дохода (Mongo), если расход — подтранзакция при делимости прихода */
    parentIncomeId?: string | null;
    /** ID дочерних расходов (Mongo), если расход разбит на подтранзакции */
    childExpenseIds?: string[];
    /** ID дочерних доходов (Mongo) при делимости родительского расхода */
    childIncomeIds?: string[];
}

export interface Income {
    _id?: string;
    objectId: number;              // ID объекта
    roomId?: number;               // ID комнаты (опционально)
    bookingId?: number;            // ID бронирования (опционально)
    /** От кого: объект+комната (room:objectId:roomId) или контрагент (cp:id) */
    source?: SourceRecipientValue;
    /** Кому: объект+комната (room:objectId:roomId) или контрагент (cp:id) */
    recipient?: SourceRecipientValue;
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
    /** ID родительского расхода (Mongo), если доход создан как подтранзакция при делимости расхода */
    parentExpenseId?: string | null;
    /** ID родительского дохода (Mongo), если доход — подтранзакция при делимости прихода */
    parentIncomeId?: string | null;
    /** ID дочерних расходов (Mongo), если приход разбит на подтранзакции */
    childExpenseIds?: string[];
    /** ID дочерних доходов (Mongo), если приход разбит на подтранзакции */
    childIncomeIds?: string[];
}

/** Тип записи в едином списке «Транзакции» (расход / доход) */
export type TransactionRecordType = 'expense' | 'income';

/** Строка объединённого списка: те же поля, что у расхода или дохода, плюс recordType */
export type TransactionListRow =
    | (Expense & { recordType: 'expense' })
    | (Income & { recordType: 'income' });

/** Период применения правила: на бронь целиком или по одному на каждый месяц брони */
export type AutoAccountingPeriod = 'per_booking' | 'per_month';

/** Откуда брать стоимость для автоучёта */
export type AutoAccountingAmountSource = 'manual' | 'booking_price' | 'internet_cost' | 'category';

/** Откуда брать количество для автоучёта */
export type AutoAccountingQuantitySource = 'manual' | 'guests' | 'guests_div_2';

/** Правило автоучёта: при добавлении брони создавать расход/доход по условиям */
export interface AutoAccountingRule {
    _id?: string;
    /** Название правила (для отображения в списке) */
    name?: string;
    /** Тип записи */
    ruleType: 'expense' | 'income';
    /** ID объекта или 'all' для всех объектов */
    objectId: number | 'all';
    /** ID комнаты или 'all' для всех комнат объекта (имеет смысл при заданном objectId) */
    roomId?: number | 'all';
    /** Фильтр по метаданным объекта: поле (district, objectType) */
    objectMetadataField?: 'district' | 'objectType';
    /** Значение метаданных объекта для совпадения */
    objectMetadataValue?: string;
    /** Фильтр по метаданным комнаты: поле (level, bedrooms, bathrooms, kitchen и т.д.) */
    roomMetadataField?: string;
    /** Оператор сравнения для метаданных комнаты */
    roomMetadataOperator?: CashflowRuleCompareOperator;
    /** Значение метаданных комнаты */
    roomMetadataValue?: string | number;
    /** Второе значение для оператора between */
    roomMetadataValueTo?: string | number;
    /** Категория расхода/дохода */
    category: string;
    /** Количество (при quantitySource === 'manual') */
    quantity: number;
    /** Откуда брать количество: вручную, количество гостей, гости÷2 (округление вверх) */
    quantitySource?: AutoAccountingQuantitySource;
    /** Сумма за единицу (при amountSource === 'manual') */
    amount?: number;
    /** Откуда брать стоимость: вручную, из брони (price), из метаданных комнаты (интернет), из категории */
    amountSource?: AutoAccountingAmountSource;
    /** per_booking — одна запись на бронь; per_month — по одному на каждый месяц проживания */
    period: AutoAccountingPeriod;
    /** Порядок применения правил */
    order: number;
    /** От кого: подставляется в создаваемую транзакцию */
    source?: SourceRecipientValue;
    /** Кому: подставляется в создаваемую транзакцию */
    recipient?: SourceRecipientValue;
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
    /** Не допускать вторую запись с тем же объектом, комнатой, категорией и отчётным месяцем (бронь не учитывается) */
    forbidDuplicates?: boolean;
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
    /** Для action=delete: сущность восстановлена из этого лога (кнопка «Восстановить» отключена) */
    restoredAt?: Date | string;
}



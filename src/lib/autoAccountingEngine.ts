/**
 * Движок автоучёта: применение правил к бронированиям и создание расходов/доходов.
 * Вызывается из API run и из sync после загрузки бронирований.
 */

import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';
import type { AutoAccountingRule, AutoAccountingAmountSource, AutoAccountingQuantitySource, CashflowRuleCompareOperator } from '@/lib/types';
import {
    buildPropertyIdToFirstRoomTypeIdMap,
    buildRoomTypeIdToPropertyIdMap,
} from '@/lib/migrations/migratePropertyObjectIdsToRoomTypeIds';
import { parseSourceRecipientValue } from '@/lib/sourceRecipientParse';
import {
    formatRoomSourceRecipient,
    roomMetadataMapKey,
    resolveUnitNameForAccountingObject,
    type RawBedsObjectForRoom,
} from '@/lib/roomBinding';
import { parseAutoAccountingDistrictsStored } from '@/lib/autoAccountingDistricts';
import { hasDuplicateForForbidCategory } from '@/lib/accountancyDuplicateGuard';

/** Подставляет «комнату из брони» в значение room:objectId:encodedName для создаваемой транзакции */
function resolveAutoRuleSourceRecipient(
    raw: string | undefined,
    accountingObjectId: number,
    bookingUnitName: string | null | undefined
): string | undefined {
    if (!raw) return undefined;
    const parsed = parseSourceRecipientValue(raw);
    if (parsed?.type === 'room_from_booking') {
        const n = bookingUnitName?.trim();
        if (!n) return undefined;
        return formatRoomSourceRecipient(accountingObjectId, n);
    }
    return raw;
}

type BookingDoc = {
    id: number;
    propertyId?: number;
    unitId?: number;
    arrival: string;
    departure: string;
    invoiceItems?: { type?: string; lineTotal?: number }[];
    numAdult?: number;
    numChild?: number;
};

function getBookingGuestsCount(booking: BookingDoc): number {
    const adult = typeof booking.numAdult === 'number' && booking.numAdult >= 0 ? booking.numAdult : 0;
    const child = typeof booking.numChild === 'number' && booking.numChild >= 0 ? booking.numChild : 0;
    return adult + child;
}

function resolveQuantity(
    rule: AutoAccountingRule & { _id?: ObjectId },
    booking: BookingDoc
): number {
    const source: AutoAccountingQuantitySource = rule.quantitySource ?? 'manual';
    if (source === 'guests') {
        const guests = getBookingGuestsCount(booking);
        return Math.max(1, guests);
    }
    if (source === 'guests_div_2') {
        const guests = getBookingGuestsCount(booking);
        return Math.max(1, Math.ceil(guests / 2));
    }
    return rule.quantity >= 1 ? rule.quantity : 1;
}

function compareNumber(
    op: CashflowRuleCompareOperator | undefined,
    actual: number,
    value?: number,
    valueTo?: number
): boolean {
    if (op === undefined || value === undefined) return false;
    const v = Number(value);
    const vTo = valueTo !== undefined ? Number(valueTo) : undefined;
    switch (op) {
        case 'eq': return actual === v;
        case 'ne': return actual !== v;
        case 'gt': return actual > v;
        case 'gte': return actual >= v;
        case 'lt': return actual < v;
        case 'lte': return actual <= v;
        case 'between': return vTo !== undefined && actual >= v && actual <= vTo;
        default: return false;
    }
}

function getBookingPrice(booking: BookingDoc): number {
    let price = 0;
    if (booking.invoiceItems?.length) {
        for (const item of booking.invoiceItems) {
            if (item.type === 'charge' && typeof item.lineTotal === 'number' && item.lineTotal > price) {
                price = item.lineTotal;
            }
        }
    }
    return price;
}

function getMonthsBetween(start: Date, end: Date): { year: number; month: number }[] {
    const result: { year: number; month: number }[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last) {
        result.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
        cur.setMonth(cur.getMonth() + 1);
    }
    return result;
}

export async function runRulesForBookings(
    bookingIds: number[],
    accountantId: string | null
): Promise<{ expensesCreated: number; incomesCreated: number; errors: string[] }> {
    const db = await getDB();
    const rulesCollection = db.collection<AutoAccountingRule & { _id?: ObjectId }>('autoAccountingRules');
    const bookingsCollection = db.collection<BookingDoc>('bookings');
    const expensesCollection = db.collection('expenses');
    const incomesCollection = db.collection('incomes');
    const usersCollection = db.collection('users');
    const categoriesCollection = db.collection('accountancyCategories');

    let effectiveAccountantId = accountantId;
    let accountantName = 'Система';
    if (!effectiveAccountantId) {
        const admin = await usersCollection.findOne(
            { role: 'admin' },
            { projection: { _id: 1, name: 1 } }
        );
        if (admin) {
            effectiveAccountantId = (admin._id as ObjectId).toString();
            accountantName = (admin as { name?: string }).name ?? accountantName;
        }
    } else {
        const user = await usersCollection.findOne(
            { _id: new ObjectId(effectiveAccountantId) },
            { projection: { name: 1 } }
        );
        if (user) accountantName = (user as { name?: string }).name ?? accountantName;
    }

    if (!effectiveAccountantId) {
        return { expensesCreated: 0, incomesCreated: 0, errors: ['Не найден пользователь для создания записей (нужен хотя бы один администратор).'] };
    }

    const rules = await rulesCollection.find({}).sort({ order: 1 }).toArray();

    const [propertyToFirstRoomTypeId, roomTypeIdToPropertyId] = await Promise.all([
        buildPropertyIdToFirstRoomTypeIdMap(db),
        buildRoomTypeIdToPropertyIdMap(db),
    ]);

    /** Правило с objectId = roomType или legacy property должно совпасть с propertyId брони. */
    const ruleObjectMatchesBooking = (ruleObjId: number | 'all', bookingPropertyId: number): boolean => {
        if (ruleObjId === 'all') return true;
        const prop = roomTypeIdToPropertyId.get(ruleObjId as number);
        if (prop !== undefined) return prop === bookingPropertyId;
        return ruleObjId === bookingPropertyId;
    };

    const processedCollection = db.collection('autoAccountingProcessedBookings');
    const markBookingsAsProcessed = async (ids: number[]) => {
        const now = new Date();
        for (const bid of ids) {
            await processedCollection.updateOne(
                { bookingId: bid },
                { $set: { bookingId: bid, processedAt: now } },
                { upsert: true }
            );
        }
    };

    if (rules.length === 0) {
        await markBookingsAsProcessed(bookingIds);
        return { expensesCreated: 0, incomesCreated: 0, errors: [] };
    }

    const bookings = await bookingsCollection.find({ id: { $in: bookingIds } }).toArray();
    const bookingMap = new Map(bookings.map((b) => [b.id, b]));

    const rawObjects = (await db.collection('objects').find({}).toArray()) as RawBedsObjectForRoom[];

    const categoryCache = new Map<string, number>();
    const getCategoryPricePerUnit = async (categoryName: string): Promise<number> => {
        if (categoryCache.has(categoryName)) return categoryCache.get(categoryName)!;
        const cat = await categoriesCollection.findOne({
            name: categoryName,
            type: { $in: ['expense', 'income'] },
        } as any);
        const price = (cat as { pricePerUnit?: number } | null)?.pricePerUnit;
        const value = typeof price === 'number' && price >= 0 ? price : 0;
        categoryCache.set(categoryName, value);
        return value;
    };

    const ROOMS_META_COLLECTION = 'objectRoomMetadata_rooms';
    const OBJECTS_META_COLLECTION = 'objectRoomMetadata_objects';

    const roomMetaCache = new Map<string, number>();
    const getInternetCostForRoom = async (
        propertyId: number,
        accountingObjectId: number,
        roomName: string | undefined
    ): Promise<number> => {
        const n = roomName?.trim();
        if (!n) return 0;
        const cacheKey = `${propertyId}|${accountingObjectId}|${n}`;
        if (roomMetaCache.has(cacheKey)) return roomMetaCache.get(cacheKey)!;
        const coll = db.collection(ROOMS_META_COLLECTION);
        let roomMeta = await coll.findOne(
            { objectId: propertyId, roomName: n },
            { projection: { internetCostPerMonth: 1 } }
        );
        if (!roomMeta && propertyId !== accountingObjectId) {
            roomMeta = await coll.findOne(
                { objectId: accountingObjectId, roomName: n },
                { projection: { internetCostPerMonth: 1 } }
            );
        }
        const raw = (roomMeta as { internetCostPerMonth?: number } | null)?.internetCostPerMonth;
        const value = typeof raw === 'number' ? raw : 0;
        roomMetaCache.set(cacheKey, value);
        return value;
    };

    const [objectMetaList, roomMetaList] = await Promise.all([
        db.collection(OBJECTS_META_COLLECTION).find({}).toArray(),
        db.collection(ROOMS_META_COLLECTION).find({}).toArray(),
    ]);
    const objectMetaMap = new Map<number, { district?: string; objectType?: string }>();
    const roomMetaMap = new Map<string, Record<string, unknown>>();
    for (const d of objectMetaList as unknown as { objectId: number; district?: string; objectType?: string }[]) {
        objectMetaMap.set(d.objectId, { district: d.district, objectType: d.objectType });
    }
    for (const d of roomMetaList as unknown as { objectId: number; roomName?: string; [k: string]: unknown }[]) {
        const rn = d.roomName;
        if (typeof rn !== 'string' || !rn.trim()) continue;
        roomMetaMap.set(roomMetadataMapKey(d.objectId, rn.trim()), d as Record<string, unknown>);
    }

    const matchObjectMetadata = (
        rule: AutoAccountingRule & { _id?: ObjectId },
        objectId: number
    ): boolean => {
        if (!rule.objectMetadataField) return true;
        const meta = objectMetaMap.get(objectId);
        if (rule.objectMetadataField === 'district') {
            if (rule.objectMetadataValue === undefined || rule.objectMetadataValue === null) return true;
            const raw = String(rule.objectMetadataValue).trim();
            if (!raw) return true;
            const actual = String(meta?.district ?? '').toLowerCase();
            const parts = parseAutoAccountingDistrictsStored(raw).map((p) => p.toLowerCase());
            return parts.includes(actual);
        }
        if (rule.objectMetadataValue === undefined) return true;
        const value = meta?.objectType ?? '';
        return String(value).toLowerCase() === String(rule.objectMetadataValue ?? '').toLowerCase();
    };

    const matchRoomMetadata = (
        rule: AutoAccountingRule & { _id?: ObjectId },
        propertyId: number,
        accountingObjectId: number,
        roomName: string | undefined
    ): boolean => {
        if (!rule.roomMetadataField || rule.roomMetadataValue === undefined || !roomName?.trim()) return true;
        const n = roomName.trim();
        const meta = (roomMetaMap.get(roomMetadataMapKey(propertyId, n)) ??
            (propertyId !== accountingObjectId
                ? roomMetaMap.get(roomMetadataMapKey(accountingObjectId, n))
                : undefined)) as Record<string, unknown> | undefined;
        const field = rule.roomMetadataField;
        let actual: number | string | undefined;
        if (field === 'bedrooms') actual = (meta?.bedrooms as number) ?? undefined;
        else if (field === 'bathrooms') actual = (meta?.bathrooms as number) ?? undefined;
        else if (field === 'livingRoomSofas') actual = (meta?.livingRoomSofas as number) ?? undefined;
        else if (field === 'level') actual = (meta?.level as string) ?? undefined;
        else if (field === 'kitchen') actual = (meta?.kitchen as string) ?? undefined;
        else if (field === 'commissionSchemeId') actual = (meta?.commissionSchemeId as number) ?? undefined;
        else if (field === 'internetCostPerMonth') actual = (meta?.internetCostPerMonth as number) ?? undefined;
        else if (field === 'internetProviderCounterpartyId') {
            const a =
                meta?.internetProviderCounterpartyId != null ? String(meta.internetProviderCounterpartyId) : '';
            const r = String(rule.roomMetadataValue ?? '');
            return r.toLowerCase() === a.toLowerCase();
        } else return true;
        if (typeof actual === 'string') {
            return String(rule.roomMetadataValue).toLowerCase() === actual.toLowerCase();
        }
        const numVal = typeof rule.roomMetadataValue === 'number' ? rule.roomMetadataValue : Number(rule.roomMetadataValue);
        const numTo = (rule as { roomMetadataValueTo?: number }).roomMetadataValueTo;
        return compareNumber(rule.roomMetadataOperator, Number(actual), numVal, numTo);
    };

    const resolveAmount = async (
        rule: AutoAccountingRule & { _id?: ObjectId },
        booking: BookingDoc,
        propertyId: number,
        accountingObjectId: number,
        roomName: string | undefined
    ): Promise<number> => {
        const source: AutoAccountingAmountSource = rule.amountSource ?? 'manual';
        switch (source) {
            case 'booking_price':
                return getBookingPrice(booking);
            case 'internet_cost':
                return await getInternetCostForRoom(propertyId, accountingObjectId, roomName);
            case 'category':
                return await getCategoryPricePerUnit(rule.category);
            case 'manual':
            default:
                if (rule.amount != null && rule.amount >= 0) return rule.amount;
                return await getCategoryPricePerUnit(rule.category);
        }
    };

    const errors: string[] = [];
    let expensesCreated = 0;
    let incomesCreated = 0;

    for (const bid of bookingIds) {
        const booking = bookingMap.get(bid);
        if (!booking) {
            errors.push(`Бронирование ${bid} не найдено.`);
            continue;
        }

        const bookingPropertyId = booking.propertyId ?? 0;
        const unitId = booking.unitId ?? undefined;
        const arrival = new Date(booking.arrival);
        const departure = new Date(booking.departure);
        const accountingObjectId =
            propertyToFirstRoomTypeId.get(bookingPropertyId) ?? bookingPropertyId;

        const bookingUnitName =
            unitId == null
                ? undefined
                : resolveUnitNameForAccountingObject(rawObjects, accountingObjectId, unitId) ??
                  resolveUnitNameForAccountingObject(rawObjects, bookingPropertyId, unitId) ??
                  undefined;

        for (const rule of rules) {
            const ruleObjId = rule.objectId;
            if (!ruleObjectMatchesBooking(ruleObjId, bookingPropertyId)) continue;
            if (!matchObjectMetadata(rule, bookingPropertyId)) continue;

            const ruleRoomName = rule.roomName;
            if (ruleRoomName !== undefined && ruleRoomName !== 'all' && ruleRoomName !== bookingUnitName) continue;
            if (!matchRoomMetadata(rule, bookingPropertyId, accountingObjectId, bookingUnitName)) continue;

            const quantity = resolveQuantity(rule, booking);
            const amount = await resolveAmount(rule, booking, bookingPropertyId, accountingObjectId, bookingUnitName);
            const ruleIdStr = rule._id ? (rule._id as ObjectId).toString() : undefined;
            const autoCreatedMeta = ruleIdStr ? { ruleId: ruleIdStr } : undefined;
            const resolvedSource = resolveAutoRuleSourceRecipient(rule.source, accountingObjectId, bookingUnitName);
            const resolvedRecipient = resolveAutoRuleSourceRecipient(rule.recipient, accountingObjectId, bookingUnitName);
            const sourceRecipientFields =
                resolvedSource || resolvedRecipient
                    ? {
                          ...(resolvedSource ? { source: resolvedSource } : {}),
                          ...(resolvedRecipient ? { recipient: resolvedRecipient } : {}),
                      }
                    : {};

            if (rule.ruleType === 'expense') {
                if (rule.period === 'per_booking') {
                    const reportMonthBooking = `${departure.getFullYear()}-${String(departure.getMonth() + 1).padStart(2, '0')}`;
                    if (
                        await hasDuplicateForForbidCategory(db, 'expenses', 'expense', {
                            objectId: accountingObjectId,
                            category: rule.category,
                            roomName: bookingUnitName ?? null,
                            reportMonth: reportMonthBooking,
                        })
                    ) {
                        continue;
                    }
                    try {
                        await expensesCollection.insertOne({
                            recordType: 'expense',
                            objectId: accountingObjectId,
                            roomName: bookingUnitName ?? null,
                            bookingId: bid,
                            ...sourceRecipientFields,
                            category: rule.category,
                            amount,
                            quantity,
                            date: arrival,
                            comment: '',
                            status: 'draft',
                            reportMonth: reportMonthBooking,
                            attachments: [],
                            accountantId: effectiveAccountantId,
                            accountantName,
                            createdAt: new Date(),
                            autoCreated: autoCreatedMeta ?? null,
                        } as any);
                        expensesCreated++;
                    } catch (e) {
                        errors.push(`Расход по брони ${bid}, правило ${rule.category}: ${(e as Error).message}`);
                    }
                } else {
                    const months = getMonthsBetween(arrival, departure);
                    for (const { year, month } of months) {
                        const date = new Date(year, month - 1, 1);
                        const reportMonth = `${year}-${String(month).padStart(2, '0')}`;
                        if (
                            await hasDuplicateForForbidCategory(db, 'expenses', 'expense', {
                                objectId: accountingObjectId,
                                category: rule.category,
                                roomName: bookingUnitName ?? null,
                                reportMonth,
                            })
                        ) {
                            continue;
                        }
                        try {
                            await expensesCollection.insertOne({
                                recordType: 'expense',
                                objectId: accountingObjectId,
                                roomName: bookingUnitName ?? null,
                                bookingId: bid,
                                ...sourceRecipientFields,
                                category: rule.category,
                                amount,
                                quantity,
                                date,
                                comment: '',
                                status: 'draft',
                                reportMonth,
                                attachments: [],
                                accountantId: effectiveAccountantId,
                                accountantName,
                                createdAt: new Date(),
                                autoCreated: autoCreatedMeta ?? null,
                            } as any);
                            expensesCreated++;
                        } catch (e) {
                            errors.push(`Расход по брони ${bid}, ${reportMonth}, правило ${rule.category}: ${(e as Error).message}`);
                        }
                    }
                }
            } else {
                if (rule.period === 'per_booking') {
                    const reportMonthBookingInc = `${departure.getFullYear()}-${String(departure.getMonth() + 1).padStart(2, '0')}`;
                    if (
                        await hasDuplicateForForbidCategory(db, 'incomes', 'income', {
                            objectId: accountingObjectId,
                            category: rule.category,
                            roomName: bookingUnitName ?? null,
                            reportMonth: reportMonthBookingInc,
                        })
                    ) {
                        continue;
                    }
                    try {
                        await incomesCollection.insertOne({
                            recordType: 'income',
                            objectId: accountingObjectId,
                            roomName: bookingUnitName ?? null,
                            bookingId: bid,
                            ...sourceRecipientFields,
                            category: rule.category,
                            amount,
                            quantity,
                            date: arrival,
                            comment: '',
                            status: 'draft',
                            reportMonth: reportMonthBookingInc,
                            attachments: [],
                            accountantId: effectiveAccountantId,
                            accountantName,
                            createdAt: new Date(),
                            autoCreated: autoCreatedMeta ?? null,
                        } as any);
                        incomesCreated++;
                    } catch (e) {
                        errors.push(`Доход по брони ${bid}, правило ${rule.category}: ${(e as Error).message}`);
                    }
                } else {
                    const months = getMonthsBetween(arrival, departure);
                    for (const { year, month } of months) {
                        const date = new Date(year, month - 1, 1);
                        const reportMonth = `${year}-${String(month).padStart(2, '0')}`;
                        if (
                            await hasDuplicateForForbidCategory(db, 'incomes', 'income', {
                                objectId: accountingObjectId,
                                category: rule.category,
                                roomName: bookingUnitName ?? null,
                                reportMonth,
                            })
                        ) {
                            continue;
                        }
                        try {
                            await incomesCollection.insertOne({
                                recordType: 'income',
                                objectId: accountingObjectId,
                                roomName: bookingUnitName ?? null,
                                bookingId: bid,
                                ...sourceRecipientFields,
                                category: rule.category,
                                amount,
                                quantity,
                                date,
                                comment: '',
                                status: 'draft',
                                reportMonth,
                                attachments: [],
                                accountantId: effectiveAccountantId,
                                accountantName,
                                createdAt: new Date(),
                                autoCreated: autoCreatedMeta ?? null,
                            } as any);
                            incomesCreated++;
                        } catch (e) {
                            errors.push(`Доход по брони ${bid}, ${reportMonth}, правило ${rule.category}: ${(e as Error).message}`);
                        }
                    }
                }
            }
        }
    }

    // Сохраняем в БД: все переданные брони отмечены как обработанные
    await markBookingsAsProcessed(bookingIds);

    return { expensesCreated, incomesCreated, errors };
}

/** Возвращает ID бронирований, для которых ещё не запускался автоучёт */
export async function getUnprocessedBookingIds(): Promise<number[]> {
    const db = await getDB();
    const allIds = await db.collection('bookings').distinct('id', {});
    const processed = await db.collection('autoAccountingProcessedBookings').distinct('bookingId', {});
    const set = new Set(processed.map((id: number) => id));
    return (allIds as number[]).filter((id) => !set.has(id));
}

/** Возвращает подмножество переданных id, для которых уже запускался автоучёт */
export async function getProcessedBookingIds(bookingIds: number[]): Promise<number[]> {
    if (bookingIds.length === 0) return [];
    const db = await getDB();
    const processed = await db.collection('autoAccountingProcessedBookings')
        .find({ bookingId: { $in: bookingIds } })
        .project({ bookingId: 1 })
        .toArray();
    return (processed as { bookingId: number }[]).map((d) => d.bookingId);
}

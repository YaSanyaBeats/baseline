/**
 * Перепривязка автотранзакций за ноябрь 2026 к комнате брони.
 * Раньше мультиобъект писал все брони с unitId 1 в первый room type.
 */

import { ObjectId, type Db } from 'mongodb';
import {
    formatRoomSourceRecipient,
    resolveBookingAccountingPlacement,
    type RawBedsObjectForRoom,
} from '@/lib/roomBinding';
import { parseSourceRecipientValue, ROOM_FROM_BOOKING_VALUE } from '@/lib/sourceRecipientParse';

export const AUTO_ACCOUNTING_ROOM_FIX_REPORT_MONTH = '2026-11';

const SAMPLE_LIMIT = 12;
const UNRESOLVED_LIMIT = 8;

export type AutoAccountingRoomMove = {
    fromObjectId: number;
    fromRoomName: string | null;
    toObjectId: number;
    toRoomName: string;
    count: number;
};

export type FixAutoAccountingRoomsStats = {
    reportMonth: string;
    dryRun: boolean;
    expensesScanned: number;
    incomesScanned: number;
    expensesUpdated: number;
    incomesUpdated: number;
    alreadyCorrect: number;
    missingBooking: number;
    unresolvedRoom: number;
    childrenUpdated: number;
    moves: AutoAccountingRoomMove[];
    unresolvedSamples: string[];
    errors: string[];
};

type AutoDoc = {
    _id: ObjectId;
    objectId?: number;
    roomName?: string | null;
    bookingId?: number;
    source?: string;
    recipient?: string;
    category?: string;
    autoCreated?: { ruleId?: string; bookingId?: number };
    parentExpenseId?: string | { toString(): string };
    parentIncomeId?: string | { toString(): string };
};

type BookingDoc = {
    id?: number;
    propertyId?: number;
    unitId?: number;
    roomId?: number;
    roomID?: number;
};

type RuleParty = {
    source?: string;
    recipient?: string;
};

type PlannedUpdate = {
    collection: 'expenses' | 'incomes';
    id: ObjectId;
    bookingId: number;
    category: string;
    fromObjectId: number;
    fromRoomName: string | null;
    toObjectId: number;
    toRoomName: string;
    set: Record<string, string | number | null>;
};

function emptyStats(dryRun: boolean): FixAutoAccountingRoomsStats {
    return {
        reportMonth: AUTO_ACCOUNTING_ROOM_FIX_REPORT_MONTH,
        dryRun,
        expensesScanned: 0,
        incomesScanned: 0,
        expensesUpdated: 0,
        incomesUpdated: 0,
        alreadyCorrect: 0,
        missingBooking: 0,
        unresolvedRoom: 0,
        childrenUpdated: 0,
        moves: [],
        unresolvedSamples: [],
        errors: [],
    };
}

function bookingIdOf(doc: AutoDoc): number | null {
    const fromAuto = doc.autoCreated?.bookingId;
    if (typeof fromAuto === 'number' && Number.isFinite(fromAuto)) return fromAuto;
    if (typeof doc.bookingId === 'number' && Number.isFinite(doc.bookingId)) return doc.bookingId;
    return null;
}

function roomKey(name: string | null | undefined): string {
    return (name ?? '').trim();
}

/**
 * Новое значение «От кого»/«Кому», если правило подставляет комнату брони
 * или правило уже удалено, а в транзакции осталась старая комната.
 * undefined — поле не менять.
 */
function nextPartyValue(
    current: string | undefined,
    ruleField: string | undefined,
    ruleFound: boolean,
    oldObjectId: number,
    oldRoomName: string,
    newObjectId: number,
    newRoomName: string,
): string | undefined {
    const next = formatRoomSourceRecipient(newObjectId, newRoomName);
    if (ruleFound && ruleField === ROOM_FROM_BOOKING_VALUE) {
        return current === next ? undefined : next;
    }
    if (!ruleFound) {
        const parsed = parseSourceRecipientValue(current);
        if (
            parsed?.type === 'room' &&
            parsed.objectId === oldObjectId &&
            parsed.roomName === oldRoomName
        ) {
            return current === next ? undefined : next;
        }
    }
    return undefined;
}

function rememberUnresolved(stats: FixAutoAccountingRoomsStats, line: string) {
    if (stats.unresolvedSamples.includes(line) || stats.unresolvedSamples.length >= UNRESOLVED_LIMIT) return;
    stats.unresolvedSamples.push(line);
}

function fillMoves(stats: FixAutoAccountingRoomsStats, planned: PlannedUpdate[]) {
    const counts = new Map<string, AutoAccountingRoomMove>();
    for (const item of planned) {
        const key = `${item.fromObjectId}|${item.fromRoomName ?? ''}|${item.toObjectId}|${item.toRoomName}`;
        const existing = counts.get(key);
        if (existing) {
            existing.count += 1;
            continue;
        }
        counts.set(key, {
            fromObjectId: item.fromObjectId,
            fromRoomName: item.fromRoomName,
            toObjectId: item.toObjectId,
            toRoomName: item.toRoomName,
            count: 1,
        });
    }
    stats.moves = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, SAMPLE_LIMIT);
}

function planDoc(
    doc: AutoDoc,
    collection: 'expenses' | 'incomes',
    bookingsById: Map<number, BookingDoc>,
    rawObjects: RawBedsObjectForRoom[],
    rulesById: Map<string, RuleParty>,
    stats: FixAutoAccountingRoomsStats,
): PlannedUpdate | null {
    const bookingId = bookingIdOf(doc);
    if (bookingId == null) {
        stats.missingBooking += 1;
        return null;
    }
    const booking = bookingsById.get(bookingId);
    if (!booking) {
        stats.missingBooking += 1;
        rememberUnresolved(stats, `Бронь ${bookingId} не найдена (${collection}).`);
        return null;
    }

    const placement = resolveBookingAccountingPlacement(rawObjects, booking);
    if (!placement.unitName) {
        stats.unresolvedRoom += 1;
        rememberUnresolved(
            stats,
            `Бронь ${bookingId}: не удалось определить комнату (property ${booking.propertyId ?? '—'}, room ${booking.roomId ?? booking.roomID ?? '—'}, unit ${booking.unitId ?? '—'}).`,
        );
        return null;
    }

    const fromObjectId = typeof doc.objectId === 'number' ? doc.objectId : 0;
    const fromRoomName = roomKey(doc.roomName);
    const toObjectId = placement.accountingObjectId;
    const toRoomName = placement.unitName;
    const ruleId = doc.autoCreated?.ruleId;
    const rule = ruleId ? rulesById.get(ruleId) : undefined;
    const ruleFound = rule != null;

    const objectChanged = fromObjectId !== toObjectId;
    const roomChanged = fromRoomName !== toRoomName;
    // Баг мультиобъекта всегда пишет objectId первого room type.
    // Смена только имени внутри уже верного типа — другой случай, его не трогаем.
    if (!objectChanged) {
        stats.alreadyCorrect += 1;
        return null;
    }

    const set: Record<string, string | number | null> = {};
    if (objectChanged) set.objectId = toObjectId;
    if (roomChanged) set.roomName = toRoomName;

    const nextSource = nextPartyValue(
        doc.source,
        rule?.source,
        ruleFound,
        fromObjectId,
        fromRoomName,
        toObjectId,
        toRoomName,
    );
    const nextRecipient = nextPartyValue(
        doc.recipient,
        rule?.recipient,
        ruleFound,
        fromObjectId,
        fromRoomName,
        toObjectId,
        toRoomName,
    );
    if (nextSource != null) set.source = nextSource;
    if (nextRecipient != null) set.recipient = nextRecipient;

    return {
        collection,
        id: doc._id,
        bookingId,
        category: doc.category ?? '',
        fromObjectId,
        fromRoomName: fromRoomName || null,
        toObjectId,
        toRoomName,
        set,
    };
}

async function loadAutoDocs(db: Db, collectionName: 'expenses' | 'incomes'): Promise<AutoDoc[]> {
    return (await db
        .collection(collectionName)
        .find({
            reportMonth: AUTO_ACCOUNTING_ROOM_FIX_REPORT_MONTH,
            $or: [
                { 'autoCreated.bookingId': { $type: 'number' } },
                { autoCreated: { $exists: true, $ne: null }, bookingId: { $type: 'number' } },
            ],
        })
        .toArray()) as AutoDoc[];
}

function childFollowsParent(child: AutoDoc, parent: PlannedUpdate): boolean {
    if (typeof child.objectId !== 'number' || child.objectId !== parent.fromObjectId) return false;
    return roomKey(child.roomName) === (parent.fromRoomName ?? '');
}

function planChild(child: AutoDoc, collection: 'expenses' | 'incomes', parent: PlannedUpdate): PlannedUpdate {
    const set: Record<string, string | number | null> = {
        objectId: parent.toObjectId,
        roomName: parent.toRoomName,
    };
    const oldRoom = parent.fromRoomName ?? '';
    const nextSource = nextPartyValue(
        child.source,
        undefined,
        false,
        parent.fromObjectId,
        oldRoom,
        parent.toObjectId,
        parent.toRoomName,
    );
    const nextRecipient = nextPartyValue(
        child.recipient,
        undefined,
        false,
        parent.fromObjectId,
        oldRoom,
        parent.toObjectId,
        parent.toRoomName,
    );
    if (nextSource != null) set.source = nextSource;
    if (nextRecipient != null) set.recipient = nextRecipient;
    return {
        collection,
        id: child._id,
        bookingId: parent.bookingId,
        category: child.category ?? '',
        fromObjectId: parent.fromObjectId,
        fromRoomName: parent.fromRoomName,
        toObjectId: parent.toObjectId,
        toRoomName: parent.toRoomName,
        set,
    };
}

async function planChildUpdates(
    db: Db,
    planned: PlannedUpdate[],
    scannedIds: Set<string>,
): Promise<PlannedUpdate[]> {
    if (planned.length === 0) return [];
    const byParentId = new Map<string, PlannedUpdate>();
    const parentKeys: Array<string | ObjectId> = [];
    for (const item of planned) {
        const id = item.id.toString();
        byParentId.set(id, item);
        parentKeys.push(id, item.id);
    }

    const childFilter = {
        $or: [{ parentExpenseId: { $in: parentKeys } }, { parentIncomeId: { $in: parentKeys } }],
    };
    const [expenseChildren, incomeChildren] = await Promise.all([
        db.collection('expenses').find(childFilter).toArray(),
        db.collection('incomes').find(childFilter).toArray(),
    ]);

    const children: PlannedUpdate[] = [];
    const consider = (doc: AutoDoc, collection: 'expenses' | 'incomes') => {
        const id = doc._id.toString();
        if (scannedIds.has(id)) return;
        const parentRaw = doc.parentExpenseId || doc.parentIncomeId;
        if (parentRaw == null || parentRaw === '') return;
        const parent = byParentId.get(typeof parentRaw === 'string' ? parentRaw : parentRaw.toString());
        if (!parent || !childFollowsParent(doc, parent)) return;
        children.push(planChild(doc, collection, parent));
    };
    for (const doc of expenseChildren as AutoDoc[]) consider(doc, 'expenses');
    for (const doc of incomeChildren as AutoDoc[]) consider(doc, 'incomes');
    return children;
}

async function applyUpdates(db: Db, updates: PlannedUpdate[], stats: FixAutoAccountingRoomsStats) {
    const groups: Record<'expenses' | 'incomes', PlannedUpdate[]> = { expenses: [], incomes: [] };
    for (const item of updates) groups[item.collection].push(item);

    for (const collectionName of ['expenses', 'incomes'] as const) {
        const items = groups[collectionName];
        if (items.length === 0) continue;
        try {
            await db.collection(collectionName).bulkWrite(
                items.map((item) => ({
                    updateOne: {
                        filter: { _id: item.id },
                        update: { $set: item.set },
                    },
                })),
                { ordered: false },
            );
            if (collectionName === 'expenses') stats.expensesUpdated += items.length;
            else stats.incomesUpdated += items.length;
        } catch (error) {
            stats.errors.push(
                `${collectionName}: ${(error as Error).message}`,
            );
        }
    }
}

export async function fixAutoAccountingRoomsForNovember2026(
    db: Db,
    options: { dryRun?: boolean } = {},
): Promise<FixAutoAccountingRoomsStats> {
    const dryRun = options.dryRun !== false;
    const stats = emptyStats(dryRun);

    const [expenseDocs, incomeDocs, rawObjects, rules] = await Promise.all([
        loadAutoDocs(db, 'expenses'),
        loadAutoDocs(db, 'incomes'),
        db.collection('objects').find({}).toArray() as Promise<RawBedsObjectForRoom[]>,
        db
            .collection('autoAccountingRules')
            .find({}, { projection: { source: 1, recipient: 1 } })
            .toArray(),
    ]);

    stats.expensesScanned = expenseDocs.length;
    stats.incomesScanned = incomeDocs.length;

    const bookingIds = new Set<number>();
    for (const doc of [...expenseDocs, ...incomeDocs]) {
        const id = bookingIdOf(doc);
        if (id != null) bookingIds.add(id);
    }
    const bookingDocs =
        bookingIds.size === 0
            ? []
            : ((await db
                  .collection('bookings')
                  .find(
                      { id: { $in: [...bookingIds] } },
                      { projection: { id: 1, propertyId: 1, unitId: 1, roomId: 1, roomID: 1 } },
                  )
                  .toArray()) as BookingDoc[]);
    const bookingsById = new Map<number, BookingDoc>();
    for (const booking of bookingDocs) {
        if (typeof booking.id === 'number') bookingsById.set(booking.id, booking);
    }

    const rulesById = new Map<string, RuleParty>();
    for (const rule of rules) {
        const id = rule._id?.toString?.();
        if (!id) continue;
        rulesById.set(id, { source: rule.source, recipient: rule.recipient });
    }

    const planned: PlannedUpdate[] = [];
    const scannedIds = new Set<string>();
    for (const doc of expenseDocs) {
        scannedIds.add(doc._id.toString());
        const item = planDoc(doc, 'expenses', bookingsById, rawObjects, rulesById, stats);
        if (item) planned.push(item);
    }
    for (const doc of incomeDocs) {
        scannedIds.add(doc._id.toString());
        const item = planDoc(doc, 'incomes', bookingsById, rawObjects, rulesById, stats);
        if (item) planned.push(item);
    }

    fillMoves(stats, planned);

    const children = await planChildUpdates(db, planned, scannedIds);
    const allUpdates = [...planned, ...children];
    stats.childrenUpdated = children.length;

    if (dryRun) {
        stats.expensesUpdated = allUpdates.filter((item) => item.collection === 'expenses').length;
        stats.incomesUpdated = allUpdates.filter((item) => item.collection === 'incomes').length;
        return stats;
    }

    stats.expensesUpdated = 0;
    stats.incomesUpdated = 0;
    await applyUpdates(db, allUpdates, stats);
    return stats;
}

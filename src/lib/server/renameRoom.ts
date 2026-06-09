import type { Db, Document } from 'mongodb';
import {
    formatRoomSourceRecipient,
    type RawBedsObjectForRoom,
} from '@/lib/roomBinding';
import { parseSourceRecipientValue } from '@/lib/sourceRecipientParse';
import { ACCOUNTANCY_CLOSED_MONTHS_COLLECTION } from '@/lib/accountancyClosedMonth';

export type RenameRoomParams = {
    objectId: number;
    oldRoomName: string;
    newRoomName: string;
};

export type RenameRoomStats = {
    objectsUpdated: boolean;
    internalObjectsUpdated: boolean;
    expensesUpdated: number;
    incomesUpdated: number;
    objectRoomMetadataRoomsUpdated: number;
    autoAccountingRulesUpdated: number;
    accountancyClosedMonthsUpdated: number;
    holyCowExpenseShareRatesUpdated: number;
    usersUpdated: number;
};

function trimName(name: string): string {
    return name.trim();
}

/** Все objectId одного property: property id и id всех roomType. */
export function collectRelatedObjectIds(
    rawObjects: readonly RawBedsObjectForRoom[],
    accountingObjectId: number,
): number[] {
    const ids = new Set<number>([accountingObjectId]);
    for (const doc of rawObjects) {
        const pid = doc?.id;
        if (typeof pid !== 'number') continue;
        const rtIds = (doc.roomTypes || [])
            .map((rt) => rt?.id)
            .filter((id): id is number => typeof id === 'number');
        const belongsToProperty =
            pid === accountingObjectId || rtIds.includes(accountingObjectId);
        if (!belongsToProperty) continue;
        ids.add(pid);
        for (const rtId of rtIds) ids.add(rtId);
    }
    return [...ids];
}

function unitNameExistsInContext(
    rawObjects: readonly RawBedsObjectForRoom[],
    accountingObjectId: number,
    roomName: string,
    excludeName?: string,
): boolean {
    const target = trimName(roomName);
    const exclude = excludeName != null ? trimName(excludeName) : null;
    for (const doc of rawObjects) {
        const pid = doc?.id;
        if (typeof pid !== 'number') continue;
        for (const rt of doc.roomTypes || []) {
            const rtMatches = accountingObjectId === pid || accountingObjectId === rt?.id;
            if (!rtMatches) continue;
            for (const u of rt?.units || []) {
                const nm = u?.name != null ? trimName(String(u.name)) : '';
                if (!nm || nm === exclude) continue;
                if (nm === target) return true;
            }
        }
    }
    return false;
}

function applyRenameToRawObjectDoc(
    doc: Document,
    accountingObjectId: number,
    oldName: string,
    newName: string,
): boolean {
    const pid = doc?.id;
    if (typeof pid !== 'number') return false;
    const source = trimName(oldName);
    const destination = trimName(newName);
    let changed = false;
    for (const rt of doc.roomTypes || []) {
        const rtMatches = accountingObjectId === pid || accountingObjectId === rt?.id;
        if (!rtMatches) continue;
        for (const u of rt?.units || []) {
            const nm = u?.name != null ? trimName(String(u.name)) : '';
            if (nm === source) {
                u.name = destination;
                changed = true;
            }
        }
    }
    return changed;
}

async function renameUnitInCollection(
    db: Db,
    collectionName: 'objects' | 'internalObjects',
    accountingObjectId: number,
    oldName: string,
    newName: string,
): Promise<boolean> {
    const coll = db.collection(collectionName);
    let anyUpdated = false;
    for await (const doc of coll.find({})) {
        if (!applyRenameToRawObjectDoc(doc, accountingObjectId, oldName, newName)) continue;
        await coll.replaceOne({ _id: doc._id }, doc);
        anyUpdated = true;
    }
    return anyUpdated;
}

function referencesRoomName(
    value: unknown,
    relatedObjectIds: readonly number[],
    oldRoomName: string,
): boolean {
    if (typeof value !== 'string') return false;
    const parsed = parseSourceRecipientValue(value);
    if (!parsed || parsed.type !== 'room') return false;
    return (
        relatedObjectIds.includes(parsed.objectId) &&
        trimName(parsed.roomName) === trimName(oldRoomName)
    );
}

function buildSourceRecipientUpdates(
    doc: Document,
    relatedObjectIds: readonly number[],
    oldName: string,
    newName: string,
): Record<string, unknown> {
    const source = trimName(oldName);
    const destination = trimName(newName);
    const set: Record<string, unknown> = {};
    for (const objectId of relatedObjectIds) {
        const token = formatRoomSourceRecipient(objectId, destination);
        if (referencesRoomName(doc.source, [objectId], source)) {
            set.source = token;
        }
        if (referencesRoomName(doc.recipient, [objectId], source)) {
            set.recipient = token;
        }
    }
    return set;
}

async function updateTransactionsCollection(
    db: Db,
    collectionName: 'expenses' | 'incomes',
    relatedObjectIds: number[],
    oldName: string,
    newName: string,
): Promise<number> {
    const coll = db.collection(collectionName);
    const source = trimName(oldName);
    const destination = trimName(newName);
    let updated = 0;

    for await (const doc of coll.find({ objectId: { $in: relatedObjectIds } })) {
        const set: Record<string, unknown> = {};
        if (trimName(String(doc.roomName ?? '')) === source) {
            set.roomName = destination;
        }
        Object.assign(set, buildSourceRecipientUpdates(doc, relatedObjectIds, source, destination));
        if (Object.keys(set).length === 0) continue;
        await coll.updateOne({ _id: doc._id }, { $set: set });
        updated++;
    }

    return updated;
}

async function updateAutoAccountingRules(
    db: Db,
    relatedObjectIds: number[],
    oldName: string,
    newName: string,
): Promise<number> {
    const coll = db.collection('autoAccountingRules');
    const source = trimName(oldName);
    const destination = trimName(newName);
    let updated = 0;

    for await (const doc of coll.find({ objectId: { $in: relatedObjectIds } })) {
        const set: Record<string, unknown> = {};
        if (doc.roomName === source) {
            set.roomName = destination;
        }
        Object.assign(set, buildSourceRecipientUpdates(doc, relatedObjectIds, source, destination));
        if (Object.keys(set).length === 0) continue;
        await coll.updateOne({ _id: doc._id }, { $set: set });
        updated++;
    }

    return updated;
}

async function updateObjectRoomMetadata(
    db: Db,
    relatedObjectIds: number[],
    oldName: string,
    newName: string,
): Promise<number> {
    const coll = db.collection('objectRoomMetadata_rooms');
    const source = trimName(oldName);
    const destination = trimName(newName);
    let updated = 0;

    for await (const doc of coll.find({
        objectId: { $in: relatedObjectIds },
        roomName: source,
    })) {
        const existing = await coll.findOne({
            objectId: doc.objectId,
            roomName: destination,
        });
        if (existing && String(existing._id) !== String(doc._id)) {
            await coll.deleteOne({ _id: doc._id });
        } else {
            await coll.updateOne({ _id: doc._id }, { $set: { roomName: destination } });
        }
        updated++;
    }

    return updated;
}

async function updateHolyCowRates(
    db: Db,
    relatedObjectIds: number[],
    oldName: string,
    newName: string,
): Promise<number> {
    const coll = db.collection('holyCowExpenseShareRates');
    const source = trimName(oldName);
    const destination = trimName(newName);
    let updated = 0;

    for await (const doc of coll.find({
        objectId: { $in: relatedObjectIds },
        roomName: source,
    })) {
        const existing = await coll.findOne({
            objectId: doc.objectId,
            roomName: destination,
            reportMonth: doc.reportMonth,
        });
        if (existing && String(existing._id) !== String(doc._id)) {
            await coll.deleteOne({ _id: doc._id });
        } else {
            await coll.updateOne({ _id: doc._id }, { $set: { roomName: destination } });
        }
        updated++;
    }

    return updated;
}

async function updateUsersRoomNames(
    db: Db,
    relatedObjectIds: number[],
    oldName: string,
    newName: string,
): Promise<number> {
    const coll = db.collection('users');
    const source = trimName(oldName);
    const destination = trimName(newName);
    const relatedSet = new Set(relatedObjectIds);
    let updated = 0;

    for await (const doc of coll.find({})) {
        const objects = doc.objects;
        if (!Array.isArray(objects) || objects.length === 0) continue;
        let changed = false;
        const nextObjects = objects.map((uo: { id?: number; rooms?: unknown }) => {
            if (!uo || typeof uo.id !== 'number' || !relatedSet.has(uo.id)) return uo;
            if (!Array.isArray(uo.rooms)) return uo;
            const nextRooms = uo.rooms.map((r) =>
                typeof r === 'string' && trimName(r) === source ? destination : r,
            );
            if (JSON.stringify(nextRooms) !== JSON.stringify(uo.rooms)) {
                changed = true;
                return { id: uo.id, rooms: nextRooms };
            }
            return uo;
        });
        if (changed) {
            await coll.updateOne({ _id: doc._id }, { $set: { objects: nextObjects } });
            updated++;
        }
    }

    return updated;
}

async function loadRawObjects(db: Db): Promise<RawBedsObjectForRoom[]> {
    const [internalDocs, bedsDocs] = await Promise.all([
        db.collection('internalObjects').find({}).toArray(),
        db.collection('objects').find({}).toArray(),
    ]);
    return [...internalDocs, ...bedsDocs] as RawBedsObjectForRoom[];
}

export class RenameRoomError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RenameRoomError';
    }
}

export async function runRenameRoom(db: Db, params: RenameRoomParams): Promise<RenameRoomStats> {
    const objectId = params.objectId;
    const oldName = trimName(params.oldRoomName);
    const newName = trimName(params.newRoomName);

    if (!Number.isFinite(objectId)) {
        throw new RenameRoomError('Укажите объект');
    }
    if (!oldName) {
        throw new RenameRoomError('Укажите комнату');
    }
    if (!newName) {
        throw new RenameRoomError('Укажите новое имя комнаты');
    }
    if (oldName === newName) {
        throw new RenameRoomError('Новое имя должно отличаться от текущего');
    }

    const rawObjects = await loadRawObjects(db);
    if (!unitNameExistsInContext(rawObjects, objectId, oldName)) {
        throw new RenameRoomError('Комната с указанным именем не найдена');
    }
    if (unitNameExistsInContext(rawObjects, objectId, newName, oldName)) {
        throw new RenameRoomError('Комната с таким именем уже существует в этом объекте');
    }

    const relatedObjectIds = collectRelatedObjectIds(rawObjects, objectId);

    const [
        objectsUpdated,
        internalObjectsUpdated,
        expensesUpdated,
        incomesUpdated,
        objectRoomMetadataRoomsUpdated,
        autoAccountingRulesUpdated,
        accountancyClosedMonthsUpdated,
        holyCowExpenseShareRatesUpdated,
        usersUpdated,
    ] = await Promise.all([
        renameUnitInCollection(db, 'objects', objectId, oldName, newName),
        renameUnitInCollection(db, 'internalObjects', objectId, oldName, newName),
        updateTransactionsCollection(db, 'expenses', relatedObjectIds, oldName, newName),
        updateTransactionsCollection(db, 'incomes', relatedObjectIds, oldName, newName),
        updateObjectRoomMetadata(db, relatedObjectIds, oldName, newName),
        updateAutoAccountingRules(db, relatedObjectIds, oldName, newName),
        db.collection(ACCOUNTANCY_CLOSED_MONTHS_COLLECTION).updateMany(
            { objectId: { $in: relatedObjectIds }, roomKey: oldName },
            { $set: { roomKey: newName } },
        ).then((r) => r.modifiedCount),
        updateHolyCowRates(db, relatedObjectIds, oldName, newName),
        updateUsersRoomNames(db, relatedObjectIds, oldName, newName),
    ]);

    return {
        objectsUpdated,
        internalObjectsUpdated,
        expensesUpdated,
        incomesUpdated,
        objectRoomMetadataRoomsUpdated,
        autoAccountingRulesUpdated,
        accountancyClosedMonthsUpdated,
        holyCowExpenseShareRatesUpdated,
        usersUpdated,
    };
}

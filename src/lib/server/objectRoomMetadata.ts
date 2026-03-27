/**
 * Серверные функции для работы с метаданными объектов и комнат.
 * Коллекция objectRoomMetadata хранит данные отдельно от objects,
 * т.к. коллекция objects при синхронизации полностью стирается.
 */

import { getDB } from '../db/getDB';
import type { ObjectType, RoomLevel } from '../types';
import type { CommissionSchemeId } from '../commissionCalculation';

export interface ObjectMetadataDoc {
    objectId: number;
    district?: string;
    objectType?: ObjectType;
}

export interface RoomMetadataDoc {
    objectId: number;
    roomId: number;
    bedrooms?: number;
    bathrooms?: number;
    livingRoomSofas?: number;
    kitchen?: 'yes' | 'no';
    level?: RoomLevel;
    commissionSchemeId?: CommissionSchemeId;
    internetProviderCounterpartyId?: string;
    internetCostPerMonth?: number;
}

const OBJECTS_COLLECTION = 'objectRoomMetadata_objects';
const ROOMS_COLLECTION = 'objectRoomMetadata_rooms';

export async function getAllObjectMetadata(): Promise<Record<number, ObjectMetadataDoc>> {
    const db = await getDB();
    const collection = db.collection<ObjectMetadataDoc>(OBJECTS_COLLECTION);
    const docs = await collection.find({}).toArray();
    const result: Record<number, ObjectMetadataDoc> = {};
    for (const doc of docs) {
        result[doc.objectId] = doc;
    }
    return result;
}

export async function getAllRoomMetadata(): Promise<Record<string, RoomMetadataDoc>> {
    const db = await getDB();
    const collection = db.collection<RoomMetadataDoc>(ROOMS_COLLECTION);
    const docs = await collection.find({}).toArray();
    const result: Record<string, RoomMetadataDoc> = {};
    for (const doc of docs) {
        result[`${doc.objectId}_${doc.roomId}`] = doc;
    }
    return result;
}

function filterUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined)
    ) as Partial<T>;
}

export async function upsertObjectMetadata(
    objectId: number,
    data: { district?: string; objectType?: ObjectType }
): Promise<void> {
    const db = await getDB();
    const collection = db.collection<ObjectMetadataDoc>(OBJECTS_COLLECTION);
    const toSet = filterUndefined({ objectId, ...data });
    await collection.updateOne(
        { objectId },
        { $set: toSet },
        { upsert: true }
    );
}

export async function upsertRoomMetadata(
    objectId: number,
    roomId: number,
    data: Partial<Omit<RoomMetadataDoc, 'objectId' | 'roomId'>>,
    options?: { unset?: (keyof RoomMetadataDoc)[] }
): Promise<void> {
    const db = await getDB();
    const collection = db.collection<RoomMetadataDoc>(ROOMS_COLLECTION);
    const toSet = filterUndefined({ objectId, roomId, ...data });
    const update: Record<string, unknown> = {};
    if (Object.keys(toSet).length > 0) update.$set = toSet;
    if (options?.unset?.length) {
        update.$unset = Object.fromEntries(options.unset.map((k) => [String(k), '']));
    }
    if (Object.keys(update).length === 0) return;
    await collection.updateOne({ objectId, roomId }, update, { upsert: true });
}

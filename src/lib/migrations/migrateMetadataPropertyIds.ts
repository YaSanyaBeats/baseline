/**
 * Миграция objectRoomMetadata_*: objectId = roomType.id → propertyId (objects.id).
 * Дубликаты с тем же propertyId + roomName сливаются, лишние записи удаляются.
 */

import type { Db, Document } from 'mongodb';
import {
    resolvePropertyIdForMetadata,
    resolveUnitNameForAccountingObject,
    type RawBedsObjectForRoom,
} from '@/lib/roomBinding';
import { loadRawObjectsForMetadata } from '@/lib/server/resolveMetadataPropertyId';

export type MigrateMetadataPropertyIdsStats = {
    objectMetadata: {
        scanned: number;
        ambiguous: number;
        merged: number;
        rekeyed: number;
        deleted: number;
    };
    roomMetadata: {
        scanned: number;
        ambiguous: number;
        merged: number;
        rekeyed: number;
        deleted: number;
        roomIdResolved: number;
    };
    errors: string[];
};

const ROOM_META_FIELDS = [
    'bedrooms',
    'bathrooms',
    'livingRoomSofas',
    'kitchen',
    'level',
    'commissionSchemeId',
    'internetProviderCounterpartyId',
    'internetCostPerMonth',
] as const;

const OBJECT_META_FIELDS = ['district', 'objectType'] as const;

function _idToStr(id: unknown): string {
    if (id && typeof (id as { toString?: () => string }).toString === 'function') {
        return (id as { toString: () => string }).toString();
    }
    return String(id);
}

function isDefined(v: unknown): boolean {
    return v !== undefined && v !== null && v !== '';
}

function mergeFields(
    canonical: Document,
    legacy: Document,
    fields: readonly string[],
): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
        if (!isDefined(canonical[f]) && isDefined(legacy[f])) {
            patch[f] = legacy[f];
        }
    }
    return patch;
}

function isRoomTypeId(rawObjects: RawBedsObjectForRoom[], objectId: number): boolean {
    return resolvePropertyIdForMetadata(rawObjects, objectId) !== objectId;
}

async function resolveRoomName(
    rawObjects: RawBedsObjectForRoom[],
    doc: Document,
): Promise<string | null> {
    if (typeof doc.roomName === 'string' && doc.roomName.trim() !== '') {
        return doc.roomName.trim();
    }
    if (typeof doc.roomId === 'number' && !Number.isNaN(doc.roomId)) {
        return resolveUnitNameForAccountingObject(rawObjects, doc.objectId, doc.roomId);
    }
    return null;
}

export async function runMigrateMetadataPropertyIds(db: Db): Promise<MigrateMetadataPropertyIdsStats> {
    const errors: string[] = [];
    const rawObjects = await loadRawObjectsForMetadata(db);

    const stats: MigrateMetadataPropertyIdsStats = {
        objectMetadata: { scanned: 0, ambiguous: 0, merged: 0, rekeyed: 0, deleted: 0 },
        roomMetadata: { scanned: 0, ambiguous: 0, merged: 0, rekeyed: 0, deleted: 0, roomIdResolved: 0 },
        errors,
    };

    const objCol = db.collection('objectRoomMetadata_objects');
    for await (const doc of objCol.find({})) {
        stats.objectMetadata.scanned++;
        const d = doc as Document;
        const objectId = d.objectId;
        if (typeof objectId !== 'number') continue;

        const propertyId = resolvePropertyIdForMetadata(rawObjects, objectId);
        if (propertyId === objectId) continue;

        stats.objectMetadata.ambiguous++;
        const canonical = await objCol.findOne({ objectId: propertyId });
        if (canonical) {
            const patch = mergeFields(canonical, d, OBJECT_META_FIELDS);
            if (Object.keys(patch).length > 0) {
                await objCol.updateOne({ _id: canonical._id }, { $set: patch });
            }
            await objCol.deleteOne({ _id: d._id });
            stats.objectMetadata.merged++;
            stats.objectMetadata.deleted++;
        } else {
            await objCol.updateOne({ _id: d._id }, { $set: { objectId: propertyId } });
            stats.objectMetadata.rekeyed++;
        }
    }

    const roomCol = db.collection('objectRoomMetadata_rooms');
    for await (const doc of roomCol.find({})) {
        stats.roomMetadata.scanned++;
        const d = doc as Document;
        const objectId = d.objectId;
        if (typeof objectId !== 'number') {
            errors.push(`objectRoomMetadata_rooms ${_idToStr(d._id)}: objectId не число`);
            continue;
        }

        const roomName = await resolveRoomName(rawObjects, d);
        if (!roomName) {
            errors.push(
                `objectRoomMetadata_rooms ${_idToStr(d._id)}: нет roomName и не удалось разрешить roomId ${d.roomId}`,
            );
            continue;
        }

        const propertyId = resolvePropertyIdForMetadata(rawObjects, objectId);
        const needsRoomNameFix = d.roomName !== roomName || typeof d.roomId === 'number';
        const needsPropertyIdFix = propertyId !== objectId;

        if (needsRoomNameFix && typeof d.roomId === 'number') {
            stats.roomMetadata.roomIdResolved++;
        }

        if (!needsPropertyIdFix && !needsRoomNameFix) continue;

        if (needsPropertyIdFix) stats.roomMetadata.ambiguous++;

        const canonical = await roomCol.findOne({ objectId: propertyId, roomName });
        const legacyIsCanonical = d._id?.toString() === canonical?._id?.toString();

        if (canonical && !legacyIsCanonical) {
            const patch = mergeFields(canonical, d, ROOM_META_FIELDS);
            const set: Record<string, unknown> = { ...patch, objectId: propertyId, roomName };
            await roomCol.updateOne({ _id: canonical._id }, { $set: set, $unset: { roomId: '' } });
            await roomCol.deleteOne({ _id: d._id });
            stats.roomMetadata.merged++;
            stats.roomMetadata.deleted++;
        } else if (needsPropertyIdFix || needsRoomNameFix) {
            await roomCol.updateOne(
                { _id: d._id },
                {
                    $set: { objectId: propertyId, roomName },
                    $unset: { roomId: '' },
                },
            );
            if (needsPropertyIdFix) stats.roomMetadata.rekeyed++;
        }
    }

    return stats;
}

/**
 * Предпросмотр: сколько записей с roomType.id ещё не приведены к propertyId.
 */
export async function previewMigrateMetadataPropertyIds(db: Db): Promise<{
    ambiguousObjectMetadata: number;
    ambiguousRoomMetadata: number;
    roomMetadataWithoutRoomName: number;
}> {
    const rawObjects = await loadRawObjectsForMetadata(db);

    let ambiguousObjectMetadata = 0;
    let ambiguousRoomMetadata = 0;
    let roomMetadataWithoutRoomName = 0;

    const objCol = db.collection('objectRoomMetadata_objects');
    for await (const doc of objCol.find({})) {
        const objectId = (doc as Document).objectId;
        if (typeof objectId === 'number' && isRoomTypeId(rawObjects, objectId)) {
            ambiguousObjectMetadata++;
        }
    }

    const roomCol = db.collection('objectRoomMetadata_rooms');
    for await (const doc of roomCol.find({})) {
        const d = doc as Document;
        const objectId = d.objectId;
        if (typeof objectId !== 'number') continue;
        if (isRoomTypeId(rawObjects, objectId)) ambiguousRoomMetadata++;
        const roomName = await resolveRoomName(rawObjects, d);
        if (!roomName) roomMetadataWithoutRoomName++;
    }

    return { ambiguousObjectMetadata, ambiguousRoomMetadata, roomMetadataWithoutRoomName };
}

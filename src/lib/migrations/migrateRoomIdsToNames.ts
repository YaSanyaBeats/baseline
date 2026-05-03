/**
 * Одноразовая миграция: unit id / roomId → имя юнита в учётных коллекциях.
 */

import type { Db, Document } from 'mongodb';
import {
    formatRoomSourceRecipient,
    resolveUnitNameForAccountingObject,
    type RawBedsObjectForRoom,
} from '@/lib/roomBinding';

export type MigrateRoomNamesStats = {
    expenses: { scanned: number; updated: number };
    incomes: { scanned: number; updated: number };
    objectRoomMetadataRooms: { scanned: number; updated: number };
    objectRoomMetadataObjects: { skipped: boolean; note: string };
    autoAccountingRules: { scanned: number; updated: number };
    users: { scanned: number; updated: number };
    errors: string[];
};

function _idToStr(id: unknown): string {
    if (id && typeof (id as { toString?: () => string }).toString === 'function') {
        return (id as { toString: () => string }).toString();
    }
    return String(id);
}

function migrateRoomPrefixedString(
    val: string,
    rawObjects: RawBedsObjectForRoom[],
): string | null {
    const m = /^room:(-?\d+):(.+)$/.exec(val);
    if (!m) return null;
    const oid = +m[1];
    const seg = m[2];
    if (!/^-?\d+$/.test(seg)) return null;
    const uid = +seg;
    const name = resolveUnitNameForAccountingObject(rawObjects, oid, uid);
    if (!name) return null;
    return formatRoomSourceRecipient(oid, name);
}

async function loadRawObjectsForRoomMigration(db: Db): Promise<RawBedsObjectForRoom[]> {
    const [internalDocs, bedsDocs] = await Promise.all([
        db.collection('internalObjects').find({}).toArray(),
        db.collection('objects').find({}).toArray(),
    ]);
    return [...internalDocs, ...bedsDocs] as RawBedsObjectForRoom[];
}

export async function runMigrateRoomIdsToNames(db: Db): Promise<MigrateRoomNamesStats> {
    const errors: string[] = [];
    const rawObjects = await loadRawObjectsForRoomMigration(db);

    const stats: MigrateRoomNamesStats = {
        expenses: { scanned: 0, updated: 0 },
        incomes: { scanned: 0, updated: 0 },
        objectRoomMetadataRooms: { scanned: 0, updated: 0 },
        objectRoomMetadataObjects: {
            skipped: true,
            note: 'В коллекции нет полей комнаты — только метаданные объекта (objectId).',
        },
        autoAccountingRules: { scanned: 0, updated: 0 },
        users: { scanned: 0, updated: 0 },
        errors,
    };

    const expCol = db.collection('expenses');
    for await (const doc of expCol.find({})) {
        stats.expenses.scanned++;
        const d = doc as Document;
        const set: Record<string, unknown> = {};
        const unset: Record<string, string> = {};
        if (typeof d.roomId === 'number' && !Number.isNaN(d.roomId)) {
            const nm = resolveUnitNameForAccountingObject(rawObjects, d.objectId, d.roomId);
            if (nm) set.roomName = nm;
            unset.roomId = '';
        }
        for (const f of ['source', 'recipient'] as const) {
            if (typeof d[f] === 'string') {
                const n = migrateRoomPrefixedString(d[f], rawObjects);
                if (n) set[f] = n;
            }
        }
        if (Object.keys(set).length > 0 || Object.keys(unset).length > 0) {
            await expCol.updateOne(
                { _id: d._id },
                {
                    ...(Object.keys(set).length ? { $set: set } : {}),
                    ...(Object.keys(unset).length ? { $unset: unset } : {}),
                },
            );
            stats.expenses.updated++;
        }
    }

    const incCol = db.collection('incomes');
    for await (const doc of incCol.find({})) {
        stats.incomes.scanned++;
        const d = doc as Document;
        const set: Record<string, unknown> = {};
        const unset: Record<string, string> = {};
        if (typeof d.roomId === 'number' && !Number.isNaN(d.roomId)) {
            const nm = resolveUnitNameForAccountingObject(rawObjects, d.objectId, d.roomId);
            if (nm) set.roomName = nm;
            unset.roomId = '';
        }
        for (const f of ['source', 'recipient'] as const) {
            if (typeof d[f] === 'string') {
                const n = migrateRoomPrefixedString(d[f], rawObjects);
                if (n) set[f] = n;
            }
        }
        if (Object.keys(set).length > 0 || Object.keys(unset).length > 0) {
            await incCol.updateOne(
                { _id: d._id },
                {
                    ...(Object.keys(set).length ? { $set: set } : {}),
                    ...(Object.keys(unset).length ? { $unset: unset } : {}),
                },
            );
            stats.incomes.updated++;
        }
    }

    const metaRooms = db.collection('objectRoomMetadata_rooms');
    for await (const doc of metaRooms.find({})) {
        stats.objectRoomMetadataRooms.scanned++;
        const d = doc as Document;
        if (typeof d.roomId !== 'number' || Number.isNaN(d.roomId)) continue;
        const nm = resolveUnitNameForAccountingObject(rawObjects, d.objectId, d.roomId);
        if (!nm) {
            errors.push(`objectRoomMetadata_rooms ${_idToStr(d._id)}: не найдено имя для unit ${d.roomId}`);
            continue;
        }
        await metaRooms.updateOne(
            { _id: d._id },
            { $set: { roomName: nm }, $unset: { roomId: '' } },
        );
        stats.objectRoomMetadataRooms.updated++;
    }

    const rulesCol = db.collection('autoAccountingRules');
    for await (const doc of rulesCol.find({})) {
        stats.autoAccountingRules.scanned++;
        const d = doc as Document;
        const set: Record<string, unknown> = {};
        const unset: Record<string, string> = {};
        if (d.roomId === 'all') {
            set.roomName = 'all';
            unset.roomId = '';
        } else if (typeof d.roomId === 'number' && !Number.isNaN(d.roomId)) {
            const oid = d.objectId === 'all' ? null : d.objectId;
            if (oid == null || typeof oid !== 'number') {
                errors.push(`autoAccountingRules ${_idToStr(d._id)}: objectId all с числовым roomId — пропуск`);
            } else {
                const nm = resolveUnitNameForAccountingObject(rawObjects, oid, d.roomId);
                if (nm) {
                    set.roomName = nm;
                    unset.roomId = '';
                } else {
                    errors.push(`autoAccountingRules ${_idToStr(d._id)}: не найдено имя для unit ${d.roomId}`);
                }
            }
        }
        for (const f of ['source', 'recipient'] as const) {
            if (typeof d[f] === 'string') {
                const n = migrateRoomPrefixedString(d[f], rawObjects);
                if (n) set[f] = n;
            }
        }
        if (Object.keys(set).length > 0 || Object.keys(unset).length > 0) {
            await rulesCol.updateOne(
                { _id: d._id },
                {
                    ...(Object.keys(set).length ? { $set: set } : {}),
                    ...(Object.keys(unset).length ? { $unset: unset } : {}),
                },
            );
            stats.autoAccountingRules.updated++;
        }
    }

    const usersCol = db.collection('users');
    for await (const doc of usersCol.find({})) {
        stats.users.scanned++;
        const d = doc as Document;
        const objects = d.objects;
        if (!Array.isArray(objects) || objects.length === 0) continue;
        let changed = false;
        const nextObjects = objects.map((uo: { id?: number; rooms?: unknown }) => {
            if (!uo || typeof uo.id !== 'number' || !Array.isArray(uo.rooms)) return uo;
            const names: string[] = [];
            for (const r of uo.rooms) {
                if (typeof r === 'string' && r.trim() !== '') {
                    names.push(r.trim());
                    continue;
                }
                if (typeof r === 'number' && !Number.isNaN(r)) {
                    const nm = resolveUnitNameForAccountingObject(rawObjects, uo.id, r);
                    if (nm) names.push(nm);
                }
            }
            const prev = JSON.stringify(uo.rooms);
            const nxt = JSON.stringify(names);
            if (prev !== nxt) changed = true;
            return { id: uo.id, rooms: names };
        });
        if (changed) {
            await usersCol.updateOne({ _id: d._id }, { $set: { objects: nextObjects } });
            stats.users.updated++;
        }
    }

    return stats;
}

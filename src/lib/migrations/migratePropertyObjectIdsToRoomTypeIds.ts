/**
 * Одноразовая миграция: ID property (документ в коллекции objects) → id первого roomTypes[0].
 * Используется после перехода на модель «строка объекта = roomType».
 */

import type { Db } from 'mongodb';

export type MigrationCollectionStats = { scanned: number; updated: number };

export type MigratePropertyObjectIdsResult = {
    dryRun: boolean;
    /** propertyId → roomTypes[0].id */
    mapEntries: { propertyId: number; firstRoomTypeId: number }[];
    users: MigrationCollectionStats;
    expenses: MigrationCollectionStats;
    incomes: MigrationCollectionStats;
    reports: MigrationCollectionStats;
    counterparties: MigrationCollectionStats;
    cashflows: MigrationCollectionStats;
    cashflowRules: MigrationCollectionStats;
    autoAccountingRules: MigrationCollectionStats;
    optionsExcludeObjects: MigrationCollectionStats;
    auditLogs: MigrationCollectionStats;
};

/** Строит карту propertyId → roomTypes[0].id по коллекции objects (Beds24). */
export async function buildPropertyIdToFirstRoomTypeIdMap(db: Db): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    const docs = await db.collection('objects').find({}).toArray();
    for (const doc of docs) {
        const pid = doc?.id;
        if (typeof pid !== 'number' || pid <= 0) continue;
        const rt0 = doc?.roomTypes?.[0];
        if (rt0 && typeof rt0.id === 'number') {
            map.set(pid, rt0.id);
        }
    }
    return map;
}

/** Обратная карта: roomType.id → propertyId (все roomTypes документа). */
export async function buildRoomTypeIdToPropertyIdMap(db: Db): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    const docs = await db.collection('objects').find({}).toArray();
    for (const doc of docs) {
        const pid = doc?.id;
        if (typeof pid !== 'number' || pid <= 0) continue;
        for (const rt of doc?.roomTypes || []) {
            if (rt && typeof rt.id === 'number') {
                map.set(rt.id, pid);
            }
        }
    }
    return map;
}

function mapScalar(oldId: number | undefined | null, m: Map<number, number>): number | undefined | null {
    if (oldId == null || typeof oldId !== 'number') return oldId;
    return m.get(oldId) ?? oldId;
}

function migrateRoomPrefixed(value: unknown, m: Map<number, number>): string | undefined {
    if (typeof value !== 'string' || !value.startsWith('room:')) return undefined;
    const parts = value.split(':');
    if (parts.length !== 3) return undefined;
    const oid = Number(parts[1]);
    const roomId = parts[2];
    if (Number.isNaN(oid)) return undefined;
    const next = m.get(oid);
    if (next === undefined) return undefined;
    return `room:${next}:${roomId}`;
}

/**
 * Выполняет миграцию привязок с property ID на id первого roomType.
 * @param dryRun — только подсчёт и diff, без записи в БД.
 */
export async function migratePropertyObjectIdsToRoomTypeIds(
    db: Db,
    options: { dryRun?: boolean } = {}
): Promise<MigratePropertyObjectIdsResult> {
    const dryRun = Boolean(options.dryRun);
    const m = await buildPropertyIdToFirstRoomTypeIdMap(db);

    const mapEntries = [...m.entries()].map(([propertyId, firstRoomTypeId]) => ({
        propertyId,
        firstRoomTypeId,
    }));

    const emptyStats = (): MigrationCollectionStats => ({ scanned: 0, updated: 0 });

    const result: MigratePropertyObjectIdsResult = {
        dryRun,
        mapEntries,
        users: emptyStats(),
        expenses: emptyStats(),
        incomes: emptyStats(),
        reports: emptyStats(),
        counterparties: emptyStats(),
        cashflows: emptyStats(),
        cashflowRules: emptyStats(),
        autoAccountingRules: emptyStats(),
        optionsExcludeObjects: emptyStats(),
        auditLogs: emptyStats(),
    };

    // --- users.objects[].id ---
    const usersColl = db.collection('users');
    for await (const user of usersColl.find({ objects: { $exists: true, $ne: [] } })) {
        result.users.scanned++;
        const objs = user.objects as { id: number; rooms: number[] }[] | undefined;
        if (!Array.isArray(objs)) continue;

        let changed = false;
        const nextObjects = objs.map((uo) => {
            const nid = mapScalar(uo.id, m);
            if (nid !== uo.id) changed = true;
            return { ...uo, id: nid as number };
        });

        if (changed) {
            result.users.updated++;
            if (!dryRun) {
                await usersColl.updateOne({ _id: user._id }, { $set: { objects: nextObjects } });
            }
        }
    }

    // --- expenses ---
    const expColl = db.collection('expenses');
    const expenses = await expColl.find({}).toArray();
    for (const doc of expenses) {
        result.expenses.scanned++;
        const newOid = mapScalar(doc.objectId, m);
        const ns = migrateRoomPrefixed(doc.source, m);
        const nr = migrateRoomPrefixed(doc.recipient, m);
        const patch: Record<string, unknown> = {};
        if (newOid !== doc.objectId) patch.objectId = newOid;
        if (ns !== undefined) patch.source = ns;
        if (nr !== undefined) patch.recipient = nr;
        if (Object.keys(patch).length === 0) continue;
        result.expenses.updated++;
        if (!dryRun) {
            await expColl.updateOne({ _id: doc._id }, { $set: patch });
        }
    }

    // --- incomes ---
    const incColl = db.collection('incomes');
    const incomes = await incColl.find({}).toArray();
    for (const doc of incomes) {
        result.incomes.scanned++;
        const newOid = mapScalar(doc.objectId, m);
        const ns = migrateRoomPrefixed(doc.source, m);
        const nr = migrateRoomPrefixed(doc.recipient, m);
        const patch: Record<string, unknown> = {};
        if (newOid !== doc.objectId) patch.objectId = newOid;
        if (ns !== undefined) patch.source = ns;
        if (nr !== undefined) patch.recipient = nr;
        if (Object.keys(patch).length === 0) continue;
        result.incomes.updated++;
        if (!dryRun) {
            await incColl.updateOne({ _id: doc._id }, { $set: patch });
        }
    }

    // --- reports ---
    const repColl = db.collection('reports');
    const reports = await repColl.find({}).toArray();
    for (const doc of reports) {
        result.reports.scanned++;
        const newOid = mapScalar(doc.objectId, m);
        if (newOid === doc.objectId) continue;
        result.reports.updated++;
        if (!dryRun) {
            await repColl.updateOne({ _id: doc._id }, { $set: { objectId: newOid } });
        }
    }

    // --- counterparties.roomLinks ---
    const cpColl = db.collection('counterparties');
    const cps = await cpColl.find({}).toArray();
    for (const doc of cps) {
        result.counterparties.scanned++;
        const links = doc.roomLinks as { id: number; rooms: number[] }[] | undefined;
        if (!Array.isArray(links)) continue;
        let changed = false;
        const next = links.map((l) => {
            const nid = mapScalar(l.id, m);
            if (nid !== l.id) changed = true;
            return { ...l, id: nid as number };
        });
        if (changed) {
            result.counterparties.updated++;
            if (!dryRun) {
                await cpColl.updateOne({ _id: doc._id }, { $set: { roomLinks: next } });
            }
        }
    }

    // --- cashflows.roomLinks ---
    const cfColl = db.collection('cashflows');
    const cfs = await cfColl.find({}).toArray();
    for (const doc of cfs) {
        result.cashflows.scanned++;
        const links = doc.roomLinks as { id: number; rooms: number[] }[] | undefined;
        if (!Array.isArray(links)) continue;
        let changed = false;
        const next = links.map((l) => {
            const nid = mapScalar(l.id, m);
            if (nid !== l.id) changed = true;
            return { ...l, id: nid as number };
        });
        if (changed) {
            result.cashflows.updated++;
            if (!dryRun) {
                await cfColl.updateOne({ _id: doc._id }, { $set: { roomLinks: next } });
            }
        }
    }

    // --- cashflowRules: filters[].roomLinks ---
    const crColl = db.collection('cashflowRules');
    const rules = await crColl.find({}).toArray();
    for (const doc of rules) {
        result.cashflowRules.scanned++;
        const filters = doc.filters as Array<{ roomLinks?: { id: number; rooms: number[] }[] }> | undefined;
        if (!Array.isArray(filters)) continue;
        let changed = false;
        const nextFilters = filters.map((f) => {
            if (!Array.isArray(f.roomLinks)) return f;
            const nl = f.roomLinks.map((l) => {
                const nid = mapScalar(l.id, m);
                if (nid !== l.id) changed = true;
                return { ...l, id: nid as number };
            });
            return { ...f, roomLinks: nl };
        });
        if (changed) {
            result.cashflowRules.updated++;
            if (!dryRun) {
                await crColl.updateOne({ _id: doc._id }, { $set: { filters: nextFilters } });
            }
        }
    }

    // --- autoAccountingRules.objectId (число, не 'all') ---
    const aaColl = db.collection('autoAccountingRules');
    const aaRules = await aaColl.find({}).toArray();
    for (const doc of aaRules) {
        result.autoAccountingRules.scanned++;
        const oid = doc.objectId;
        if (oid === 'all' || typeof oid !== 'number') continue;
        const newOid = mapScalar(oid, m);
        if (newOid === oid) continue;
        result.autoAccountingRules.updated++;
        if (!dryRun) {
            await aaColl.updateOne({ _id: doc._id }, { $set: { objectId: newOid } });
        }
    }

    // --- options excludeObjects ---
    const optColl = db.collection('options');
    const excludeDoc = await optColl.findOne({ optionName: 'excludeObjects' });
    if (excludeDoc && Array.isArray(excludeDoc.value)) {
        result.optionsExcludeObjects.scanned = 1;
        const arr = excludeDoc.value as number[];
        const next = arr.map((id) => (m.get(id) ?? id) as number);
        const changed = next.some((v, i) => v !== arr[i]);
        if (changed) {
            result.optionsExcludeObjects.updated = 1;
            if (!dryRun) {
                await optColl.updateOne({ optionName: 'excludeObjects' }, { $set: { value: next } });
            }
        }
    }

    // --- auditLogs.metadata.objectId (опционально) ---
    const alColl = db.collection('auditLogs');
    const logs = await alColl.find({ 'metadata.objectId': { $exists: true } }).toArray();
    for (const doc of logs) {
        result.auditLogs.scanned++;
        const mid = doc.metadata?.objectId;
        if (typeof mid !== 'number') continue;
        const newOid = mapScalar(mid, m);
        if (newOid === mid) continue;
        result.auditLogs.updated++;
        if (!dryRun) {
            await alColl.updateOne({ _id: doc._id }, { $set: { 'metadata.objectId': newOid } });
        }
    }

    return result;
}

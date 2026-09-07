import { Collection, ObjectId } from 'mongodb';
import { getDB } from '@/lib/db/getDB';
import { IP_COLLECTIONS } from './collections';
import {
    DEFAULT_APIFY_BUDGET,
    DEFAULT_CHANNELS,
    DEFAULT_TEMPERATURE,
    type ApifyBudgetSettings,
    type ChannelSettings,
    type IpParameterCell,
    type IpRoom,
    type PricingQuality,
    type TemperatureSettings,
} from './types';
import type { PeriodId, SeasonRegime } from './periods';
import clustersSeed from './seed/clusters.json';
import roomsMasterSeed from './seed/rooms-master.json';
import targetsSeed from './seed/occupancy-targets.json';
import parametersSeed from './seed/ip-parameters.json';
import compSetExample from './seed/comp-set-example.json';

function num(v: unknown, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function asQuality(v: unknown): PricingQuality {
    if (v === 'ok' || v === 'thin' || v === 'one-yr' || v === 'LT-only' || v === 'est') return v;
    return 'ok';
}

export function parseParameterCells(): IpParameterCell[] {
    return (parametersSeed as Array<Record<string, unknown>>).map((row) => ({
        cluster: String(row.cluster),
        period: String(row.period) as PeriodId,
        dates: String(row.dates ?? ''),
        regime: String(row.regime) as SeasonRegime,
        rpi: num(row.RPI),
        elasticityPpPer10pct: num(row.elasticity_pp_per10pct),
        adrFloor: num(row.adr_floor),
        adrBase: num(row.adr_base),
        adrCeiling: num(row.adr_ceiling),
        occNorm: num(row.occ_target),
        windowMedD: num(row.window_med_d),
        pickupNorm60d: num(row.pickup_norm_60d),
        pickupNorm30d: num(row.pickup_norm_30d),
        pickupNorm14d: num(row.pickup_norm_14d),
        quality: asQuality(row.quality),
    }));
}

async function mergeLivePortfolio(): Promise<IpRoom[]> {
    const db = await getDB();
    const objects = await db.collection('objects').find({}).toArray();
    const liveByRoom = new Map<number, { name: string; units: number; propertyId: number; propertyName: string }>();
    for (const obj of objects) {
        const propertyId = Number(obj.id);
        const propertyName = String(obj.name ?? '');
        for (const rt of obj.roomTypes || []) {
            if (rt == null || typeof rt.id !== 'number') continue;
            liveByRoom.set(rt.id, {
                name: String(rt.name ?? `Room ${rt.id}`),
                units: Number(rt.qty) > 0 ? Number(rt.qty) : 1,
                propertyId,
                propertyName,
            });
        }
    }

    const qtyByRoom = new Map<number, number>();
    for (const r of roomsMasterSeed as Array<{ roomId: number; qty: number }>) {
        qtyByRoom.set(r.roomId, r.qty);
    }

    const seenRoomIds = new Set<number>();
    const rooms: IpRoom[] = [];
    for (const row of clustersSeed as Array<{ cluster: string; roomId: number; name: string; units: number }>) {
        if (seenRoomIds.has(row.roomId)) continue;
        seenRoomIds.add(row.roomId);
        const live = liveByRoom.get(row.roomId);
        liveByRoom.delete(row.roomId);
        rooms.push({
            roomId: row.roomId,
            name: live?.name || row.name,
            cluster: row.cluster,
            units: live?.units || qtyByRoom.get(row.roomId) || row.units || 1,
            propertyId: live?.propertyId ?? null,
            propertyName: live?.propertyName ?? null,
            floor: null,
            managedFrom: null,
            managedTo: null,
            needsOnboarding: false,
            source: live ? 'live' : 'seed',
        });
    }

    for (const [roomId, live] of liveByRoom) {
        rooms.push({
            roomId,
            name: live.name,
            cluster: '',
            units: live.units,
            propertyId: live.propertyId,
            propertyName: live.propertyName,
            floor: null,
            managedFrom: null,
            managedTo: null,
            needsOnboarding: true,
            source: 'live',
        });
    }

    return rooms;
}

function seedCompetitors() {
    const docs: Array<Record<string, unknown>> = [];
    const root = compSetExample as unknown as {
        objects?: Record<string, { roomId: number | null; comps?: Array<Record<string, unknown>> }>;
    };
    for (const obj of Object.values(root.objects || {})) {
        if (obj.roomId == null) continue;
        for (const comp of obj.comps || []) {
            docs.push({
                roomId: obj.roomId,
                platform: comp.platform,
                url: comp.url,
                name: comp.name,
                bedrooms: comp.bedrooms ?? null,
                sqm: comp.sqm ?? null,
                view: comp.view ?? null,
                status: 'approved',
                isReference: false,
                lastPrice: null,
                lastSiteAnchor: null,
                lastAvailability: null,
                updatedAt: null,
            });
        }
    }
    return docs;
}

async function dedupeRoomsByRoomId(roomsCol: Collection) {
    const dupes = await roomsCol
        .aggregate<{ ids: ObjectId[]; n: number }>([
            { $group: { _id: '$roomId', ids: { $push: '$_id' }, n: { $sum: 1 } } },
            { $match: { n: { $gt: 1 } } },
        ])
        .toArray();
    for (const dup of dupes) {
        const extra = dup.ids.slice(1);
        if (extra.length) {
            await roomsCol.deleteMany({ _id: { $in: extra } });
        }
    }
}

export async function ensurePricingSeeded(): Promise<{ seeded: boolean }> {
    const db = await getDB();
    let seeded = false;
    const roomsCol = db.collection(IP_COLLECTIONS.rooms);

    await dedupeRoomsByRoomId(roomsCol);
    try {
        await roomsCol.createIndex({ roomId: 1 }, { unique: true, name: 'ip_rooms_roomId_unique' });
    } catch {
        await dedupeRoomsByRoomId(roomsCol);
        await roomsCol.createIndex({ roomId: 1 }, { unique: true, name: 'ip_rooms_roomId_unique' });
    }

    const rooms = await mergeLivePortfolio();
    if (rooms.length) {
        const existing = new Set(
            (await roomsCol.find({}, { projection: { roomId: 1 } }).toArray()).map((r) => Number(r.roomId)),
        );
        const missing = rooms.filter((r) => !existing.has(r.roomId));
        if (missing.length) {
            await roomsCol.bulkWrite(
                missing.map((room) => ({
                    updateOne: {
                        filter: { roomId: room.roomId },
                        update: { $setOnInsert: room },
                        upsert: true,
                    },
                })),
                { ordered: false },
            );
            seeded = true;
        }
    }

    if ((await db.collection(IP_COLLECTIONS.parameters).countDocuments()) === 0) {
        const params = parseParameterCells();
        if (params.length) await db.collection(IP_COLLECTIONS.parameters).insertMany(params);
        seeded = true;
    }

    if ((await db.collection(IP_COLLECTIONS.targets).countDocuments()) === 0) {
        const year = new Date().getFullYear();
        const targets = (targetsSeed as Array<{ period: string; occTargetPct: number }>).map((row) => ({
            level: 'global' as const,
            key: 'portfolio',
            period: row.period,
            year,
            occTargetPct: row.occTargetPct,
        }));
        if (targets.length) await db.collection(IP_COLLECTIONS.targets).insertMany(targets);
        seeded = true;
    }

    const settings = db.collection(IP_COLLECTIONS.settings);
    await settings.updateOne(
        { _id: 'temperature' as never },
        { $setOnInsert: { ...DEFAULT_TEMPERATURE } },
        { upsert: true },
    );
    await settings.updateOne(
        { _id: 'channels' as never },
        { $setOnInsert: { ...DEFAULT_CHANNELS } },
        { upsert: true },
    );
    await settings.updateOne(
        { _id: 'apify' as never },
        { $setOnInsert: { ...DEFAULT_APIFY_BUDGET } },
        { upsert: true },
    );

    if ((await db.collection(IP_COLLECTIONS.competitors).countDocuments()) === 0) {
        const comps = seedCompetitors();
        if (comps.length) await db.collection(IP_COLLECTIONS.competitors).insertMany(comps as never[]);
        seeded = true;
    }

    return { seeded };
}

export async function getTemperature(): Promise<TemperatureSettings> {
    const db = await getDB();
    const doc = await db.collection(IP_COLLECTIONS.settings).findOne({ _id: 'temperature' as never });
    if (!doc) return DEFAULT_TEMPERATURE;
    const { _id: _ignored, ...rest } = doc as Record<string, unknown> & { _id?: unknown };
    return { ...DEFAULT_TEMPERATURE, ...(rest as Partial<TemperatureSettings>) };
}

export async function getChannels(): Promise<ChannelSettings> {
    const db = await getDB();
    const doc = await db.collection(IP_COLLECTIONS.settings).findOne({ _id: 'channels' as never });
    if (!doc) return DEFAULT_CHANNELS;
    return {
        coefficients: { ...DEFAULT_CHANNELS.coefficients, ...(doc.coefficients || {}) },
        ladders: { ...DEFAULT_CHANNELS.ladders, ...(doc.ladders || {}) },
        lastMinute: { ...DEFAULT_CHANNELS.lastMinute, ...(doc.lastMinute || {}) },
    };
}

export async function getApifyBudget(): Promise<ApifyBudgetSettings> {
    const db = await getDB();
    const doc = await db.collection(IP_COLLECTIONS.settings).findOne({ _id: 'apify' as never });
    return { ...DEFAULT_APIFY_BUDGET, ...(doc || {}) };
}

export async function getRooms(): Promise<IpRoom[]> {
    const db = await getDB();
    const rows = (await db
        .collection(IP_COLLECTIONS.rooms)
        .find({})
        .sort({ cluster: 1, name: 1 })
        .toArray()) as unknown as IpRoom[];
    const seen = new Set<number>();
    return rows.filter((room) => {
        if (seen.has(room.roomId)) return false;
        seen.add(room.roomId);
        return true;
    });
}

export async function getParameters(): Promise<IpParameterCell[]> {
    const db = await getDB();
    const rows = await db.collection(IP_COLLECTIONS.parameters).find({}).toArray();
    return rows as unknown as IpParameterCell[];
}

export async function getGlobalTargets(year = new Date().getFullYear()): Promise<Record<string, number>> {
    const db = await getDB();
    let rows = await db.collection(IP_COLLECTIONS.targets).find({ level: 'global', year }).toArray();
    if (!rows.length) {
        const latest = await db
            .collection(IP_COLLECTIONS.targets)
            .find({ level: 'global' })
            .sort({ year: -1 })
            .limit(1)
            .toArray();
        const fallbackYear = latest[0]?.year;
        if (fallbackYear != null) {
            rows = await db.collection(IP_COLLECTIONS.targets).find({ level: 'global', year: fallbackYear }).toArray();
        }
    }
    const map: Record<string, number> = {};
    for (const row of rows) {
        map[String(row.period)] = Number(row.occTargetPct);
    }
    return map;
}

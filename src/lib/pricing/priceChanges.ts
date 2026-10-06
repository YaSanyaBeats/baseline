import { getDB } from '@/lib/db/getDB';
import { IP_COLLECTIONS } from './collections';
import { mapPricingMode } from './effectMath';
import { PERIOD_IDS, resolvePeriodWindow, type PeriodId } from './periods';
import { getParameters, getRooms, getTemperature } from './seed';
import type { ChannelEventType, PriceChangeSnapshot } from './effectTypes';
import type { IpParameterCell } from './types';

export type StoredPriceChange = {
    id: string;
    roomId: number | null;
    cluster: string | null;
    period: string;
    year: number | null;
    stayDate: string;
    changedAt: string;
    priceBefore: number | null;
    priceAfter: number;
    initiator: string;
    userName: string;
    snapshot: PriceChangeSnapshot;
    legacy: boolean;
};

export type StoredChannelEvent = {
    id: string;
    eventAt: string;
    eventType: ChannelEventType;
    description: string;
    affectedScope: string;
};

export type RecordPriceChangeInput = {
    roomId: number | null;
    cluster: string | null;
    period: string;
    year: number;
    priceAfter: number;
    priceBefore: number | null;
    initiator: string;
    userName: string;
    reason: string;
    rpi?: number | null;
    regime?: string | null;
    paceRatio?: number | null;
    competitor?: number | null;
    competitorCount?: number | null;
    floored?: boolean;
    daysToArrival?: number | null;
    complete?: boolean;
};

const EVENT_TYPES = new Set<ChannelEventType>([
    'channel_connect',
    'channel_close',
    'campaign_start',
    'calendar_event',
    'ota_closure',
]);

function isoDate(v: unknown): string | null {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
    if (typeof v === 'string' && v.trim()) {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return null;
}

function stayDateFor(period: string, year: number | null): string {
    if ((PERIOD_IDS as readonly string[]).includes(period) && year != null) {
        return resolvePeriodWindow(period as PeriodId, year).startIso;
    }
    return new Date().toISOString().slice(0, 10);
}

function cellFor(cells: IpParameterCell[], cluster: string | null, period: string): IpParameterCell | null {
    if (!cluster) return null;
    return cells.find((c) => c.cluster === cluster && c.period === period) ?? null;
}

function anchorConfidence(count: number): 'high' | 'medium' | 'low' {
    if (count >= 5) return 'high';
    if (count >= 2) return 'medium';
    return 'low';
}

function buildSnapshot(
    input: RecordPriceChangeInput,
    cell: IpParameterCell | null,
    temperatureG: number,
    marketWeight: number,
): PriceChangeSnapshot {
    const competitor = input.competitor != null && Number.isFinite(input.competitor) ? Math.round(input.competitor) : null;
    const count = input.competitorCount != null && Number.isFinite(input.competitorCount) ? input.competitorCount : 0;
    const complete = input.complete ?? input.rpi != null;
    return {
        mode: mapPricingMode(input.regime ?? cell?.regime, input.daysToArrival, cell?.windowMedD),
        rpi: input.rpi != null && Number.isFinite(input.rpi) ? Math.round(input.rpi * 100) / 100 : null,
        structural_price: null,
        market_anchor:
            competitor == null
                ? null
                : {
                      price_thb: competitor,
                      confidence: anchorConfidence(count),
                      weight: Math.round(marketWeight * 100) / 100,
                      source_count: count,
                  },
        market_blended_price: null,
        final_price: Math.round(input.priceAfter),
        pace_vs_norm_pct:
            input.paceRatio != null && Number.isFinite(input.paceRatio) ? Math.round(input.paceRatio * 1000) / 10 : null,
        guards_triggered: input.floored
            ? [{ guard: 'floor_net_check', effect: `price_clamped_to_${Math.round(input.priceAfter)}` }]
            : [],
        elasticity_cluster: cell?.elasticityPpPer10pct ?? null,
        temperature: temperatureG,
        reason: input.reason || '',
        complete: Boolean(complete),
    };
}

/**
 * Insert-only. The snapshot is the reasoning at decision time and is never updated.
 * Returns null when the price did not actually change.
 */
export async function recordPriceChange(input: RecordPriceChangeInput): Promise<string | null> {
    const priceAfter = Math.round(Number(input.priceAfter));
    if (!Number.isFinite(priceAfter) || priceAfter <= 0) return null;
    const priceBefore =
        input.priceBefore != null && Number.isFinite(Number(input.priceBefore)) && Number(input.priceBefore) > 0
            ? Math.round(Number(input.priceBefore))
            : null;
    if (priceBefore != null && priceBefore === priceAfter) return null;

    const db = await getDB();
    const [rooms, cells, temperature] = await Promise.all([getRooms(), getParameters(), getTemperature()]);
    let cluster = input.cluster;
    if (!cluster && input.roomId != null) {
        cluster = rooms.find((r) => r.roomId === input.roomId)?.cluster ?? null;
    }
    const col = db.collection(IP_COLLECTIONS.priceChanges);
    const since = new Date(Date.now() - 60_000);
    const recent = await col.findOne({
        roomId: input.roomId ?? null,
        cluster,
        periodCode: input.period,
        year: input.year,
        priceAfter,
        changedAt: { $gte: since },
    });
    if (recent?.id) return String(recent.id);

    const cell = cellFor(cells, cluster, input.period);
    const id = crypto.randomUUID();
    const snapshot = buildSnapshot(input, cell, temperature.g, temperature.comp / 100);
    await col.insertOne({
        id,
        roomId: input.roomId ?? null,
        cluster,
        periodCode: input.period,
        year: input.year,
        stayDate: stayDateFor(input.period, input.year),
        changedAt: new Date(),
        priceBefore,
        priceAfter,
        initiator: input.initiator,
        userName: input.userName,
        snapshot,
    });
    return id;
}

function fromStored(doc: Record<string, unknown>, legacy: boolean): StoredPriceChange | null {
    const changedAt = isoDate(doc.changedAt ?? doc.createdAt ?? doc.updatedAt);
    const priceAfter = Number(doc.priceAfter ?? doc.price);
    if (!changedAt || !Number.isFinite(priceAfter)) return null;
    const snapshot = (doc.snapshot as PriceChangeSnapshot | undefined) ?? null;
    const period = String(doc.periodCode ?? doc.period ?? '');
    const year = doc.year == null ? null : Number(doc.year);
    return {
        id: String(doc.id ?? doc._id),
        roomId: doc.roomId == null || doc.roomId === '' ? null : Number(doc.roomId),
        cluster: doc.cluster ? String(doc.cluster) : null,
        period,
        year: Number.isFinite(year as number) ? (year as number) : null,
        stayDate: String(doc.stayDate || stayDateFor(period, Number.isFinite(year as number) ? (year as number) : null)),
        changedAt,
        priceBefore:
            doc.priceBefore == null && doc.previousPrice == null
                ? null
                : Number(doc.priceBefore ?? doc.previousPrice) || null,
        priceAfter,
        initiator: String(doc.initiator || (legacy ? 'engine' : 'engine')),
        userName: String(doc.userName || ''),
        snapshot:
            snapshot ?? {
                mode: 'NORM',
                rpi: null,
                structural_price: null,
                market_anchor: null,
                market_blended_price: null,
                final_price: priceAfter,
                pace_vs_norm_pct: null,
                guards_triggered: [],
                elasticity_cluster: null,
                temperature: null,
                reason: String(doc.reason || ''),
                complete: false,
            },
        legacy,
    };
}

function legacySnapshot(doc: Record<string, unknown>, cell: IpParameterCell | null): PriceChangeSnapshot {
    const price = Math.round(Number(doc.price) || 0);
    return {
        mode: mapPricingMode(cell?.regime),
        rpi: null,
        structural_price: null,
        market_anchor: null,
        market_blended_price: null,
        final_price: price,
        pace_vs_norm_pct: null,
        guards_triggered: [],
        elasticity_cluster: cell?.elasticityPpPer10pct ?? null,
        temperature: null,
        reason: String(doc.reason || ''),
        complete: false,
    };
}

function dedupeKey(row: StoredPriceChange): string {
    const day = row.changedAt.slice(0, 10);
    return `${row.roomId ?? ''}|${row.cluster ?? ''}|${row.period}|${row.year ?? ''}|${row.priceAfter}|${day}`;
}

export async function listPriceChanges(filter: {
    period?: string;
    year?: number | null;
    stayFrom?: string;
    stayTo?: string;
}): Promise<StoredPriceChange[]> {
    const db = await getDB();
    const cells = await getParameters();
    const storedQuery: Record<string, unknown> = {};
    if (filter.period && filter.period !== 'custom') storedQuery.periodCode = filter.period;
    if (filter.year != null && filter.period !== 'custom') {
        storedQuery.$or = [{ year: filter.year }, { year: null }, { year: { $exists: false } }];
    }
    if (filter.stayFrom && filter.stayTo) {
        storedQuery.stayDate = { $gte: filter.stayFrom, $lte: filter.stayTo };
    }
    const storedDocs = await db.collection(IP_COLLECTIONS.priceChanges).find(storedQuery).toArray();
    const stored = storedDocs
        .map((doc) => fromStored(doc as unknown as Record<string, unknown>, false))
        .filter((row): row is StoredPriceChange => row != null);

    const acceptedQuery: Record<string, unknown> = {};
    const overrideQuery: Record<string, unknown> = {};
    if (filter.period && filter.period !== 'custom') {
        acceptedQuery.period = filter.period;
        overrideQuery.period = filter.period;
    }
    const [acceptedDocs, overrideDocs] = await Promise.all([
        db.collection(IP_COLLECTIONS.accepted).find(acceptedQuery).toArray(),
        db.collection(IP_COLLECTIONS.overrides).find(overrideQuery).toArray(),
    ]);

    const legacy: StoredPriceChange[] = [];
    for (const doc of acceptedDocs) {
        const raw = doc as unknown as Record<string, unknown>;
        const year = raw.year == null ? null : Number(raw.year);
        if (filter.year != null && year != null && year !== filter.year) continue;
        const period = String(raw.period || '');
        const row = fromStored(
            {
                ...raw,
                id: `legacy-accepted-${String(raw._id)}`,
                priceAfter: raw.price,
                priceBefore: raw.previousPrice ?? null,
                initiator: 'engine',
                changedAt: raw.createdAt,
                stayDate: stayDateFor(period, year),
                snapshot: legacySnapshot(raw, cellFor(cells, raw.cluster ? String(raw.cluster) : null, period)),
            },
            true,
        );
        if (row) legacy.push(row);
    }
    for (const doc of overrideDocs) {
        const raw = doc as unknown as Record<string, unknown>;
        const year = raw.year == null ? null : Number(raw.year);
        if (filter.year != null && year != null && year !== filter.year) continue;
        const period = String(raw.period || '');
        const userName = String(raw.userName || '');
        const row = fromStored(
            {
                ...raw,
                id: `legacy-override-${String(raw._id)}`,
                priceAfter: raw.price,
                priceBefore: null,
                initiator: `override:${userName || 'manager'}`,
                changedAt: raw.updatedAt ?? raw.createdAt,
                stayDate: stayDateFor(period, year),
                snapshot: legacySnapshot(raw, cellFor(cells, null, period)),
            },
            true,
        );
        if (row) legacy.push(row);
    }

    const seen = new Set(stored.map(dedupeKey));
    const merged = [...stored];
    for (const row of legacy) {
        const key = dedupeKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(row);
    }
    const rooms = await getRooms();
    const clusterByRoom = new Map(rooms.map((room) => [room.roomId, room.cluster]));
    for (const row of merged) {
        if (!row.cluster && row.roomId != null) row.cluster = clusterByRoom.get(row.roomId) || null;
    }
    const ranged =
        filter.stayFrom && filter.stayTo
            ? merged.filter((row) => row.stayDate >= filter.stayFrom! && row.stayDate <= filter.stayTo!)
            : merged;
    ranged.sort((a, b) => a.changedAt.localeCompare(b.changedAt));
    return ranged;
}

export async function getPriceChangeById(id: string): Promise<StoredPriceChange | null> {
    const db = await getDB();
    if (id.startsWith('legacy-accepted-') || id.startsWith('legacy-override-')) {
        const legacy = await listPriceChanges({});
        return legacy.find((row) => row.id === id) ?? null;
    }
    const doc = await db.collection(IP_COLLECTIONS.priceChanges).findOne({ id });
    if (!doc) return null;
    return fromStored(doc as unknown as Record<string, unknown>, false);
}

export async function listChannelEvents(): Promise<StoredChannelEvent[]> {
    const db = await getDB();
    const docs = await db.collection(IP_COLLECTIONS.channelEvents).find({}).sort({ eventAt: 1 }).toArray();
    return docs
        .map((doc) => {
            const raw = doc as unknown as Record<string, unknown>;
            const eventAt = isoDate(raw.eventAt);
            const eventType = String(raw.eventType || '') as ChannelEventType;
            if (!eventAt || !EVENT_TYPES.has(eventType)) return null;
            return {
                id: String(raw.id ?? raw._id),
                eventAt,
                eventType,
                description: String(raw.description || ''),
                affectedScope: String(raw.affectedScope || 'all'),
            };
        })
        .filter((row): row is StoredChannelEvent => row != null);
}

export async function addChannelEvent(input: {
    eventAt: string;
    eventType: string;
    description: string;
    affectedScope: string;
}): Promise<string> {
    const eventType = input.eventType as ChannelEventType;
    if (!EVENT_TYPES.has(eventType)) throw new Error('Неизвестный тип события');
    const description = input.description.trim();
    if (!description) throw new Error('Нужно описание события');
    const when = new Date(input.eventAt);
    if (Number.isNaN(when.getTime())) throw new Error('Некорректная дата события');
    const db = await getDB();
    const id = crypto.randomUUID();
    await db.collection(IP_COLLECTIONS.channelEvents).insertOne({
        id,
        eventAt: when,
        eventType,
        description,
        affectedScope: input.affectedScope || 'all',
        createdAt: new Date(),
    });
    return id;
}

export async function rollbackPriceChange(id: string, userName: string): Promise<{ restored: number; rooms: number }> {
    const change = await getPriceChangeById(id);
    if (!change) throw new Error('Изменение цены не найдено');
    if (change.priceBefore == null) throw new Error('Нет цены «до» — откатывать некуда');
    const rooms = await getRooms();
    const targets =
        change.roomId != null
            ? rooms.filter((r) => r.roomId === change.roomId)
            : rooms.filter((r) => change.cluster && r.cluster === change.cluster && !r.needsOnboarding);
    if (!targets.length) throw new Error('Не найдены комнаты для отката');

    const db = await getDB();
    const year = change.year ?? undefined;
    for (const room of targets) {
        await db.collection(IP_COLLECTIONS.overrides).updateOne(
            { roomId: room.roomId, period: change.period, ...(year != null ? { year } : {}) },
            {
                $set: {
                    roomId: room.roomId,
                    period: change.period,
                    price: change.priceBefore,
                    updatedAt: new Date(),
                    userName,
                    ...(year != null ? { year } : {}),
                },
            },
            { upsert: true },
        );
        await recordPriceChange({
            roomId: room.roomId,
            cluster: room.cluster,
            period: change.period,
            year: year ?? new Date().getFullYear(),
            priceAfter: change.priceBefore,
            priceBefore: change.priceAfter,
            initiator: `override:${userName}`,
            userName,
            reason: 'Откат после красного флага: темп ниже нормы и ниже контрольной группы.',
            rpi: change.snapshot.rpi,
            regime: change.snapshot.mode === 'NORM' ? 'SHOULDER' : change.snapshot.mode === 'LASTMINUTE' ? 'LOW' : change.snapshot.mode,
            paceRatio: change.snapshot.pace_vs_norm_pct == null ? null : change.snapshot.pace_vs_norm_pct / 100,
            competitor: change.snapshot.market_anchor?.price_thb ?? null,
            competitorCount: change.snapshot.market_anchor?.source_count ?? null,
            complete: true,
        });
    }
    return { restored: change.priceBefore, rooms: targets.length };
}

import { getDB } from '@/lib/db/getDB';
import { otaToSite } from './channels';
import { IP_COLLECTIONS } from './collections';
import { loadCurrentRoomPrices } from './desk';
import {
    CONTROL_THRESHOLD,
    addDays,
    bangkokDay,
    bangkokKey,
    confidenceLevel,
    initiatorBucket,
    interpolateAnchors,
    median,
    normAnchors,
    quantile,
    round1,
    ymd,
} from './effectMath';
import type {
    BookingsPoint,
    ChartPayload,
    CompBandPoint,
    EffectBundle,
    EffectRow,
    EffectScope,
    ExternalEvent,
    OccupancyPoint,
    PriceChangeMarker,
    PricePoint,
    RecommendationSummary,
} from './effectTypes';
import { buildMasterIdNightMap, isLongTermBooking, stayNights } from './lt';
import { bookingRoomId, OCCUPIED_STATUSES, OWNER_BLOCK_STATUS } from './occupancy';
import {
    daysBetween,
    defaultPeriodForToday,
    overlapNights,
    parseIsoDate,
    PERIOD_IDS,
    resolvePeriodWindow,
    type PeriodId,
} from './periods';
import { listChannelEvents, listPriceChanges, type StoredPriceChange } from './priceChanges';
import { ensurePricingSeeded, getChannels, getParameters, getRooms } from './seed';
import type { ChannelId, IpParameterCell, IpRoom } from './types';

export class EffectQueryError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

export type EffectBuildQuery = {
    scope: EffectScope;
    scopeId: string;
    period: PeriodId | 'custom';
    year: number;
    dateFrom?: string;
    dateTo?: string;
    effectWindow: number;
    compareYear: number | null;
    horizon: number;
};

type StayWindow = {
    start: Date;
    end: Date;
    startIso: string;
    endIso: string;
    nights: number;
    periodCode: string;
    year: number;
    normPeriod: PeriodId;
};

type ChannelKey = 'direct' | 'airbnb' | 'booking' | 'agoda' | 'trip' | 'other';

type Stay = {
    roomId: number;
    bookedAt: number;
    bookedKey: string;
    st: number;
    owner: number;
    lt: number;
    nightly: number | null;
    channel: ChannelKey;
};

type Step = { stepDay: number; at: number; before: number | null; after: number };

const DAY_MS = 86400000;

function uniqueRooms(rooms: IpRoom[]): IpRoom[] {
    const seen = new Set<number>();
    const out: IpRoom[] = [];
    for (const room of rooms) {
        if (!room.cluster || room.needsOnboarding) continue;
        if (seen.has(room.roomId)) continue;
        seen.add(room.roomId);
        out.push(room);
    }
    return out;
}

function parseTs(v: unknown): Date | null {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    if (typeof v !== 'string' || !v.trim()) return null;
    const d = new Date(v.includes('T') ? v : v.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
}

function channelOf(referer?: string): ChannelKey {
    const r = (referer || '').toLowerCase();
    if (r.includes('airbnb')) return 'airbnb';
    if (r.includes('booking')) return 'booking';
    if (r.includes('agoda')) return 'agoda';
    if (r.includes('trip') || r.includes('ctrip')) return 'trip';
    return 'direct';
}

function asChannel(platform: unknown): ChannelId | null {
    if (platform === 'airbnb' || platform === 'booking' || platform === 'agoda' || platform === 'trip') return platform;
    return null;
}

function nightlyRate(b: { arrival?: string; departure?: string; price?: number; invoiceItems?: Array<{ type?: string; lineTotal?: number }> }): number | null {
    const nights = stayNights(b.arrival, b.departure);
    if (nights <= 0) return null;
    const price = Number(b.price);
    if (Number.isFinite(price) && price > 0) return price / nights;
    let charge = 0;
    for (const item of b.invoiceItems || []) {
        if (item.type === 'charge' && typeof item.lineTotal === 'number' && item.lineTotal > 0) charge += item.lineTotal;
    }
    return charge > 0 ? charge / nights : null;
}

function resolveStay(query: EffectBuildQuery): StayWindow {
    if (query.period === 'custom') {
        if (!query.dateFrom || !query.dateTo) throw new EffectQueryError('Для произвольного диапазона нужны date_from и date_to');
        const start = parseIsoDate(query.dateFrom);
        const end = parseIsoDate(query.dateTo);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
            throw new EffectQueryError('Некорректный диапазон дат');
        }
        const nights = daysBetween(start, end) + 1;
        const mid = addDays(start, Math.floor(nights / 2));
        return {
            start,
            end,
            startIso: ymd(start),
            endIso: ymd(end),
            nights,
            periodCode: 'custom',
            year: start.getFullYear(),
            normPeriod: defaultPeriodForToday(mid),
        };
    }
    const window = resolvePeriodWindow(query.period, query.year);
    return {
        start: window.start,
        end: window.end,
        startIso: window.startIso,
        endIso: window.endIso,
        nights: window.nights,
        periodCode: query.period,
        year: window.year,
        normPeriod: query.period,
    };
}

function yearWindow(base: StayWindow, year: number, period: PeriodId | 'custom'): StayWindow {
    if (period !== 'custom' && (PERIOD_IDS as readonly string[]).includes(period)) {
        const window = resolvePeriodWindow(period, year);
        return { ...base, start: window.start, end: window.end, startIso: window.startIso, endIso: window.endIso, nights: window.nights, year: window.year };
    }
    const delta = year - base.year;
    const start = new Date(base.start.getFullYear() + delta, base.start.getMonth(), base.start.getDate());
    const end = new Date(base.end.getFullYear() + delta, base.end.getMonth(), base.end.getDate());
    return { ...base, start, end, startIso: ymd(start), endIso: ymd(end), year };
}

function prepareStays(
    bookings: Array<Record<string, unknown>>,
    roomIds: Set<number>,
    window: StayWindow,
    chain: Map<number, number>,
): Stay[] {
    const out: Stay[] = [];
    for (const raw of bookings) {
        const roomId = bookingRoomId(raw as { roomId?: number; roomID?: number });
        if (roomId == null || !roomIds.has(roomId)) continue;
        const arrival = raw.arrival ? String(raw.arrival) : undefined;
        const departure = raw.departure ? String(raw.departure) : undefined;
        const nights = overlapNights(arrival || '', departure || '', window.startIso, window.endIso);
        if (nights <= 0) continue;
        const status = String(raw.status || '').toLowerCase();
        if (status !== OWNER_BLOCK_STATUS && !OCCUPIED_STATUSES.has(status)) continue;
        const booked = parseTs(raw.bookingTime) ?? (arrival ? parseIsoDate(arrival.slice(0, 10)) : null);
        if (!booked) continue;
        const lt = status !== OWNER_BLOCK_STATUS && isLongTermBooking(
            {
                id: raw.id as number | undefined,
                masterId: (raw.masterId as number | null | undefined) ?? null,
                arrival,
                departure,
                firstName: raw.firstName ? String(raw.firstName) : undefined,
                lastName: raw.lastName ? String(raw.lastName) : undefined,
                comments: raw.comments ? String(raw.comments) : undefined,
                notes: raw.notes ? String(raw.notes) : undefined,
                status,
            },
            chain,
        );
        out.push({
            roomId,
            bookedAt: booked.getTime(),
            bookedKey: bangkokKey(booked),
            st: status === OWNER_BLOCK_STATUS || lt ? 0 : nights,
            owner: status === OWNER_BLOCK_STATUS ? nights : 0,
            lt: lt ? nights : 0,
            nightly: nightlyRate(raw as { arrival?: string; departure?: string; price?: number; invoiceItems?: Array<{ type?: string; lineTotal?: number }> }),
            channel: channelOf(raw.referer ? String(raw.referer) : undefined),
        });
    }
    out.sort((a, b) => a.bookedKey.localeCompare(b.bookedKey) || a.bookedAt - b.bookedAt);
    return out;
}

function otbPct(acc: Map<number, { st: number; owner: number; lt: number }>, rooms: IpRoom[], nights: number): number {
    let st = 0;
    let available = 0;
    for (const room of rooms) {
        const row = acc.get(room.roomId) ?? { st: 0, owner: 0, lt: 0 };
        const inventory = Math.max(1, room.units || 1) * nights;
        available += Math.max(0, inventory - row.owner - row.lt);
        st += row.st;
    }
    return available > 0 ? (st / available) * 100 : 0;
}

function occupancySeries(stays: Stay[], rooms: IpRoom[], window: StayWindow, horizon: number, todayKey: string): Map<number, number | null> {
    const ids = new Set(rooms.map((r) => r.roomId));
    const relevant = stays.filter((s) => ids.has(s.roomId));
    const acc = new Map<number, { st: number; owner: number; lt: number }>();
    const out = new Map<number, number | null>();
    let i = 0;
    for (let d = horizon; d >= 0; d--) {
        const asOf = ymd(addDays(window.end, -d));
        if (asOf > todayKey) {
            out.set(d, null);
            continue;
        }
        while (i < relevant.length && relevant[i].bookedKey <= asOf) {
            const stay = relevant[i++];
            const cur = acc.get(stay.roomId) ?? { st: 0, owner: 0, lt: 0 };
            cur.st += stay.st;
            cur.owner += stay.owner;
            cur.lt += stay.lt;
            acc.set(stay.roomId, cur);
        }
        out.set(d, round1(otbPct(acc, rooms, window.nights)));
    }
    return out;
}

function sellableIds(stays: Stay[], rooms: IpRoom[], nights: number): number[] {
    return rooms
        .filter((room) => {
            let owner = 0;
            let lt = 0;
            for (const stay of stays) {
                if (stay.roomId !== room.roomId) continue;
                owner += stay.owner;
                lt += stay.lt;
            }
            const inventory = Math.max(1, room.units || 1) * nights;
            return inventory - owner - lt > 0;
        })
        .map((room) => room.roomId);
}

function meanPace(stays: Stay[], roomIds: number[], fromMs: number, toMs: number, days: number): number {
    if (!roomIds.length || days <= 0) return 0;
    let sum = 0;
    for (const roomId of roomIds) {
        let nights = 0;
        for (const stay of stays) {
            if (stay.roomId !== roomId || stay.st <= 0) continue;
            if (stay.bookedAt >= fromMs && stay.bookedAt < toMs) nights += stay.st;
        }
        sum += nights / days;
    }
    return sum / roomIds.length;
}

function adrAfter(stays: Stay[], roomIds: number[], fromMs: number, toMs: number): number | null {
    const ids = new Set(roomIds);
    let revenue = 0;
    let nights = 0;
    for (const stay of stays) {
        if (!ids.has(stay.roomId) || stay.st <= 0 || stay.nightly == null) continue;
        if (stay.bookedAt < fromMs || stay.bookedAt >= toMs) continue;
        revenue += stay.nightly * stay.st;
        nights += stay.st;
    }
    return nights > 0 ? Math.round(revenue / nights) : null;
}

function revparOf(stays: Stay[], rooms: IpRoom[], nights: number): number | null {
    const ids = new Set(rooms.map((r) => r.roomId));
    let revenue = 0;
    let available = 0;
    const acc = new Map<number, { owner: number; lt: number }>();
    for (const stay of stays) {
        if (!ids.has(stay.roomId)) continue;
        const cur = acc.get(stay.roomId) ?? { owner: 0, lt: 0 };
        cur.owner += stay.owner;
        cur.lt += stay.lt;
        acc.set(stay.roomId, cur);
        if (stay.st > 0 && stay.nightly != null) revenue += stay.nightly * stay.st;
    }
    for (const room of rooms) {
        const row = acc.get(room.roomId) ?? { owner: 0, lt: 0 };
        const inventory = Math.max(1, room.units || 1) * nights;
        available += Math.max(0, inventory - row.owner - row.lt);
    }
    if (available <= 0) return null;
    return Math.round(revenue / available);
}

function placedDay(changedAt: string, window: StayWindow, horizon: number): { stepDay: number; marker: boolean } | null {
    const dRaw = daysBetween(bangkokDay(new Date(changedAt)), window.end);
    if (dRaw < -window.nights) return null;
    if (dRaw > horizon) return { stepDay: dRaw, marker: false };
    return { stepDay: Math.max(0, dRaw), marker: true };
}

function affectsScope(change: StoredPriceChange, scope: EffectScope, rooms: IpRoom[]): boolean {
    if (scope === 'portfolio') return true;
    if (change.roomId != null && rooms.some((room) => room.roomId === change.roomId)) return true;
    if (change.roomId == null && change.cluster && rooms.some((room) => room.cluster === change.cluster)) return true;
    return false;
}

function treatedRooms(change: StoredPriceChange, catalog: IpRoom[]): IpRoom[] {
    if (change.roomId != null) return catalog.filter((room) => room.roomId === change.roomId);
    if (!change.cluster) return [];
    return catalog.filter((room) => room.cluster === change.cluster);
}

function priceAtDay(d: number, steps: Step[], current: number | null, todayD: number): number | null {
    const applicable = steps.filter((step) => step.stepDay >= d);
    if (applicable.length) {
        applicable.sort((a, b) => a.stepDay - b.stepDay || b.at - a.at);
        return applicable[0].after;
    }
    const earliest = [...steps].sort((a, b) => b.stepDay - a.stepDay)[0];
    if (earliest?.before != null && d > earliest.stepDay) return earliest.before;
    if (current != null && d <= todayD) return current;
    return null;
}

function scopePriceAt(
    d: number,
    rooms: IpRoom[],
    stepsByRoom: Map<number, Step[]>,
    current: Map<number, number>,
    todayD: number,
    allowCurrent: boolean,
): number | null {
    const values: number[] = [];
    for (const room of rooms) {
        const price = priceAtDay(d, stepsByRoom.get(room.roomId) || [], allowCurrent ? current.get(room.roomId) ?? null : null, allowCurrent ? todayD : -1);
        if (price != null) values.push(price);
    }
    return median(values) == null ? null : Math.round(median(values) as number);
}

export async function buildEffectBundle(query: EffectBuildQuery): Promise<EffectBundle> {
    await ensurePricingSeeded();
    const stay = resolveStay(query);
    const horizon = query.horizon;
    const effectWindow = query.effectWindow;
    const [allRooms, parameters, channels] = await Promise.all([getRooms(), getParameters(), getChannels()]);
    const catalog = uniqueRooms(allRooms);
    const options = {
        clusters: [...new Set(catalog.map((room) => room.cluster))].sort((a, b) => a.localeCompare(b, 'ru')).map((id) => ({ id, label: id })),
        rooms: catalog.map((room) => ({ id: String(room.roomId), label: `${room.name} · #${room.roomId}`, cluster: room.cluster })),
    };

    let scopeRooms: IpRoom[] = catalog;
    let scopeLabel = 'all';
    if (query.scope === 'cluster') {
        scopeRooms = catalog.filter((room) => room.cluster === query.scopeId);
        if (!scopeRooms.length) throw new EffectQueryError('Кластер не найден', 404);
        scopeLabel = query.scopeId;
    } else if (query.scope === 'room') {
        const roomId = Number(query.scopeId);
        scopeRooms = catalog.filter((room) => room.roomId === roomId);
        if (!scopeRooms.length) throw new EffectQueryError('Комната не найдена', 404);
        scopeLabel = `${scopeRooms[0].name} · #${scopeRooms[0].roomId}`;
    }

    const prevYear = stay.year - 1;
    const prev = yearWindow(stay, prevYear, query.period);
    const compare = query.compareYear != null ? yearWindow(stay, query.compareYear, query.period) : null;
    const windows = [stay, prev, compare].filter((item): item is StayWindow => item != null);
    const minStart = windows.map((item) => item.startIso).sort()[0];
    const endIsos = windows.map((item) => item.endIso).sort();
    const maxEnd = addDays(parseIsoDate(endIsos[endIsos.length - 1]), 1);

    const db = await getDB();
    const roomIds = catalog.map((room) => room.roomId);
    const clusterNames = [...new Set(scopeRooms.map((room) => room.cluster))];
    const [bookingDocs, currentPrices, snapshots, changes, compareChanges, events] = await Promise.all([
        db
            .collection('bookings')
            .find(
                {
                    status: { $in: ['confirmed', 'new', 'black'] },
                    arrival: { $lt: ymd(maxEnd) },
                    departure: { $gt: minStart },
                    $or: [{ roomId: { $in: roomIds } }, { roomID: { $in: roomIds } }],
                },
                {
                    projection: {
                        id: 1,
                        masterId: 1,
                        roomId: 1,
                        roomID: 1,
                        status: 1,
                        arrival: 1,
                        departure: 1,
                        bookingTime: 1,
                        firstName: 1,
                        lastName: 1,
                        comments: 1,
                        notes: 1,
                        referer: 1,
                        price: 1,
                        invoiceItems: 1,
                    },
                },
            )
            .toArray(),
        loadCurrentRoomPrices(stay.startIso, stay.endIso),
        db
            .collection(IP_COLLECTIONS.snapshots)
            .find({ cluster: { $in: clusterNames } })
            .project({ cluster: 1, platform: 1, pricePerNightNorm: 1, createdAt: 1, availabilityStatus: 1 })
            .toArray(),
        listPriceChanges(
            query.period === 'custom' ? { stayFrom: stay.startIso, stayTo: stay.endIso } : { period: query.period, year: stay.year },
        ),
        compare
            ? listPriceChanges(
                  query.period === 'custom'
                      ? { stayFrom: compare.startIso, stayTo: compare.endIso }
                      : { period: query.period, year: compare.year },
              )
            : Promise.resolve([] as StoredPriceChange[]),
        listChannelEvents(),
    ]);

    const chain = buildMasterIdNightMap(
        bookingDocs.map((doc) => ({
            id: doc.id as number | undefined,
            masterId: (doc.masterId as number | null | undefined) ?? null,
            arrival: doc.arrival ? String(doc.arrival) : undefined,
            departure: doc.departure ? String(doc.departure) : undefined,
        })),
    );
    const roomIdSet = new Set(roomIds);
    const stays = prepareStays(bookingDocs as Array<Record<string, unknown>>, roomIdSet, stay, chain);
    const prevStays = prepareStays(bookingDocs as Array<Record<string, unknown>>, roomIdSet, prev, chain);
    const compareStays = compare && compare.year !== prev.year ? prepareStays(bookingDocs as Array<Record<string, unknown>>, roomIdSet, compare, chain) : compare ? prevStays : [];

    const today = bangkokDay(new Date());
    const todayKey = ymd(today);
    const rawLead = daysBetween(today, stay.end);
    const todayD = rawLead < 0 ? 0 : Math.min(horizon, rawLead);
    const dNow = rawLead < 0 ? 0 : Math.min(horizon, rawLead);

    const occ = occupancySeries(stays, scopeRooms, stay, horizon, todayKey);
    const yoySource = compare ? occupancySeries(compareStays, scopeRooms, compare, horizon, todayKey) : null;
    const yoyAvailable = prevStays.some((stayRow) => scopeRooms.some((room) => room.roomId === stayRow.roomId) && stayRow.st > 0);

    const paramMap = new Map<string, IpParameterCell>();
    for (const cell of parameters) paramMap.set(`${cell.cluster}::${cell.period}`, cell);
    const paceNorm: ChartPayload['pace_norm_series'] = [];
    const normAt = new Map<number, number>();
    for (let d = horizon; d >= 0; d--) {
        let weight = 0;
        let sum = 0;
        for (const name of new Set(scopeRooms.map((room) => room.cluster))) {
            const cell = paramMap.get(`${name}::${stay.normPeriod}`);
            if (!cell) continue;
            const w = scopeRooms.filter((room) => room.cluster === name).reduce((acc, room) => acc + Math.max(1, room.units || 1), 0);
            sum += interpolateAnchors(Math.min(d, 120), normAnchors(cell)) * w;
            weight += w;
        }
        if (!weight) continue;
        const norm = round1(sum / weight);
        normAt.set(d, norm);
        paceNorm.push({ days_before: d, norm_pct: norm });
    }

    const visibleChanges = changes.filter((change) => affectsScope(change, query.scope, scopeRooms));
    const stepsByRoom = new Map<number, Step[]>();
    const markers: PriceChangeMarker[] = [];
    for (const change of visibleChanges) {
        const placed = placedDay(change.changedAt, stay, horizon);
        if (!placed) continue;
        const covered = treatedRooms(change, catalog);
        for (const room of covered) {
            const list = stepsByRoom.get(room.roomId) || [];
            list.push({
                stepDay: placed.stepDay,
                at: new Date(change.changedAt).getTime(),
                before: change.priceBefore,
                after: change.priceAfter,
            });
            stepsByRoom.set(room.roomId, list);
        }
        if (!placed.marker) continue;
        markers.push({
            id: change.id,
            days_before: placed.stepDay,
            changed_at: change.changedAt,
            price_before: change.priceBefore,
            price_after: change.priceAfter,
            initiator: change.initiator,
            user_name: change.userName || undefined,
            snapshot: change.snapshot,
        });
    }
    markers.sort((a, b) => b.days_before - a.days_before || a.changed_at.localeCompare(b.changed_at));

    const compareSteps = new Map<number, Step[]>();
    if (compare) {
        for (const change of compareChanges.filter((item) => affectsScope(item, query.scope, scopeRooms))) {
            const placed = placedDay(change.changedAt, compare, horizon);
            if (!placed) continue;
            for (const room of treatedRooms(change, catalog)) {
                const list = compareSteps.get(room.roomId) || [];
                list.push({ stepDay: placed.stepDay, at: new Date(change.changedAt).getTime(), before: change.priceBefore, after: change.priceAfter });
                compareSteps.set(room.roomId, list);
            }
        }
    }

    const occupancy_series: OccupancyPoint[] = [];
    const price_series: PricePoint[] = [];
    const bookings_series: BookingsPoint[] = [];
    const bookingsByDay = new Map<string, BookingsPoint>();
    for (const stayRow of stays) {
        if (stayRow.st <= 0 || !scopeRooms.some((room) => room.roomId === stayRow.roomId)) continue;
        if (stayRow.bookedKey > todayKey) continue;
        const d = daysBetween(parseIsoDate(stayRow.bookedKey), stay.end);
        if (d < 0 || d > horizon) continue;
        const row = bookingsByDay.get(stayRow.bookedKey) ?? {
            days_before: d,
            nights_per_day: 0,
            bookings_per_day: 0,
            channel_breakdown: {},
        };
        row.nights_per_day = round1(row.nights_per_day + stayRow.st);
        row.bookings_per_day += 1;
        row.channel_breakdown = row.channel_breakdown || {};
        row.channel_breakdown[stayRow.channel] = round1((row.channel_breakdown[stayRow.channel] || 0) + stayRow.st);
        bookingsByDay.set(stayRow.bookedKey, row);
    }

    for (let d = horizon; d >= 0; d--) {
        const asOf = ymd(addDays(stay.end, -d));
        const occPct = occ.get(d) ?? null;
        if (occPct != null) {
            occupancy_series.push({
                days_before: d,
                occ_pct: occPct,
                occ_pct_yoy: yoySource ? yoySource.get(d) ?? null : null,
            });
        }
        const price = scopePriceAt(d, scopeRooms, stepsByRoom, currentPrices, todayD, true);
        const priceYoy = compare ? scopePriceAt(d, scopeRooms, compareSteps, currentPrices, -1, false) : null;
        if (price != null || priceYoy != null) {
            price_series.push({ days_before: d, price_thb: price, price_yoy: priceYoy });
        }
        if (asOf <= todayKey) {
            const booked = bookingsByDay.get(asOf);
            bookings_series.push(
                booked
                    ? { ...booked, days_before: d }
                    : { days_before: d, nights_per_day: 0, bookings_per_day: 0, channel_breakdown: {} },
            );
        }
    }

    const compByDay = new Map<number, number[]>();
    for (const snap of snapshots) {
        if (!snap.pricePerNightNorm || snap.availabilityStatus === 'strategic_hold') continue;
        const created = parseTs(snap.createdAt);
        if (!created) continue;
        const d = daysBetween(bangkokDay(created), stay.end);
        if (d < 0 || d > horizon) continue;
        const platform = asChannel(snap.platform);
        const site = platform ? otaToSite(Number(snap.pricePerNightNorm), platform, channels) : Number(snap.pricePerNightNorm);
        if (!Number.isFinite(site) || site <= 0) continue;
        const list = compByDay.get(d) || [];
        list.push(site);
        compByDay.set(d, list);
    }
    const comp_band: CompBandPoint[] = [...compByDay.entries()]
        .map(([days_before, prices]) => {
            const sorted = [...prices].sort((a, b) => a - b);
            return {
                days_before,
                comp_low: Math.round(quantile(sorted, 0.25)),
                comp_median: Math.round(quantile(sorted, 0.5)),
                comp_high: Math.round(quantile(sorted, 0.75)),
                snapshot_count: sorted.length,
            };
        })
        .sort((a, b) => b.days_before - a.days_before);

    const sellable = new Set(sellableIds(stays, catalog, stay.nights));
    const effect_table: EffectRow[] = [];
    for (const marker of markers) {
        const change = visibleChanges.find((item) => item.id === marker.id);
        if (!change) continue;
        const t0 = new Date(change.changedAt).getTime();
        const afterEnd = Math.min(t0 + effectWindow * DAY_MS, Date.now());
        const afterDays = Math.max(0, (afterEnd - t0) / DAY_MS);
        const windowComplete = afterDays >= effectWindow - 0.05;
        const beforeIds = treatedRooms(change, catalog).map((room) => room.roomId).filter((id) => sellable.has(id));
        const paceBefore = round1(meanPace(stays, beforeIds, t0 - effectWindow * DAY_MS, t0, effectWindow));
        const paceAfter = round1(meanPace(stays, beforeIds, t0, afterEnd, Math.max(afterDays, 1)));
        const deltaPace = round1(paceAfter - paceBefore);
        const family = catalog.filter((room) => change.cluster && room.cluster === change.cluster);
        const treated = new Set(treatedRooms(change, catalog).map((room) => room.roomId));
        const blocked = new Set<number>();
        for (const other of visibleChanges) {
            if (other.id === change.id) continue;
            const at = new Date(other.changedAt).getTime();
            if (at < t0 - effectWindow * DAY_MS || at > t0 + effectWindow * DAY_MS) continue;
            for (const room of treatedRooms(other, catalog)) blocked.add(room.roomId);
        }
        const controlIds = family.map((room) => room.roomId).filter((id) => sellable.has(id) && !treated.has(id) && !blocked.has(id));
        const controlDeltas = controlIds.map((id) => {
            const before = meanPace(stays, [id], t0 - effectWindow * DAY_MS, t0, effectWindow);
            const after = meanPace(stays, [id], t0, afterEnd, Math.max(afterDays, 1));
            return after - before;
        });
        const controlMedian = median(controlDeltas);
        const controlDelta = controlMedian == null ? null : round1(controlMedian);
        const above = controlDelta == null ? null : round1(deltaPace - controlDelta);
        const yoyPace =
            yoyAvailable && beforeIds.length
                ? round1(
                      meanPace(
                          prevStays,
                          beforeIds,
                          t0 - 365 * DAY_MS,
                          t0 - 365 * DAY_MS + Math.max(afterDays, 1) * DAY_MS,
                          Math.max(afterDays, 1),
                      ),
                  )
                : null;
        const verdict = verdictSafe(above, controlIds.length);
        const occThen = occ.get(marker.days_before);
        const occNow = occ.get(dNow);
        const normNow = normAt.get(dNow);
        const priceUp = change.priceBefore != null && change.priceAfter > change.priceBefore;
        const belowNorm = occNow != null && normNow != null && occNow < normNow;
        effect_table.push({
            change_id: change.id,
            pace_before: paceBefore,
            pace_after: paceAfter,
            delta_pace: deltaPace,
            control_delta: controlDelta,
            above_control: above,
            control_group_size: controlIds.length,
            adr_after: adrAfter(stays, beforeIds, t0, afterEnd),
            occupancy_forecast_delta: occThen != null && occNow != null ? round1(occNow - occThen) : null,
            yoy_pace_delta: yoyPace == null ? null : round1(paceAfter - yoyPace),
            confidence: confidenceLevel({
                controlSize: controlIds.length,
                yoy: yoyAvailable,
                above,
                windowComplete,
                afterDays,
            }),
            verdict,
            alert: Boolean(priceUp && verdict === 'bad' && belowNorm),
            window_complete: windowComplete,
        });
    }

    const external_events: ExternalEvent[] = [];
    for (const event of events) {
        const eventDay = bangkokDay(new Date(event.eventAt));
        const dRaw = daysBetween(eventDay, stay.end);
        if (dRaw > horizon || dRaw < -stay.nights) continue;
        const scopeOk =
            event.affectedScope === 'all' ||
            scopeRooms.some((room) => event.affectedScope === room.cluster || event.affectedScope === String(room.roomId));
        if (!scopeOk) continue;
        external_events.push({
            id: event.id,
            days_before: Math.max(0, dRaw),
            event_type: event.eventType,
            description: event.description,
            event_at: event.eventAt,
        });
    }

    const earliest = stays
        .filter((row) => scopeRooms.some((room) => room.roomId === row.roomId))
        .map((row) => row.bookedKey)
        .sort()[0];
    const historyDays = earliest ? Math.max(0, daysBetween(parseIsoDate(earliest), today)) : 0;

    const changedIds = new Set<number>();
    for (const change of visibleChanges) {
        for (const room of treatedRooms(change, catalog)) changedIds.add(room.roomId);
    }
    const scopeIdSet = new Set(scopeRooms.map((room) => room.roomId));
    const familyClusters = new Set(scopeRooms.map((room) => room.cluster));
    const controlRooms = catalog.filter(
        (room) => familyClusters.has(room.cluster) && !scopeIdSet.has(room.roomId) && !changedIds.has(room.roomId),
    );
    const portfolioRev = revparOf(stays, scopeRooms, stay.nights);
    const controlRev = controlRooms.length ? revparOf(stays, controlRooms, stay.nights) : null;
    const buckets = { engine: 0, manager: 0, override: 0, rejected: 0 };
    for (const marker of markers) buckets[initiatorBucket(marker.initiator)] += 1;
    const verdicts = { confirmed: 0, neutral: 0, bad: 0 };
    for (const row of effect_table) verdicts[row.verdict] += 1;

    const summary: RecommendationSummary = {
        scope: query.scope,
        scope_id: query.scope === 'portfolio' ? 'all' : query.scopeId,
        period_from: stay.startIso,
        period_to: stay.endIso,
        total_changes: markers.length,
        by_initiator: buckets,
        by_verdict: verdicts,
        revpar_vs_control: {
            portfolio_revpar_thb: portfolioRev,
            control_revpar_thb: controlRev,
            delta_thb: portfolioRev != null && controlRev != null ? portfolioRev - controlRev : null,
            delta_pct:
                portfolioRev != null && controlRev != null && controlRev !== 0
                    ? round1(((portfolioRev - controlRev) / controlRev) * 100)
                    : null,
        },
    };

    const chart: ChartPayload = {
        meta: {
            scope: query.scope,
            scope_id: query.scope === 'portfolio' ? 'all' : query.scopeId,
            scope_label: scopeLabel,
            period_code: stay.periodCode,
            date_from: stay.startIso,
            date_to: stay.endIso,
            horizon_days: horizon,
            effect_window: effectWindow,
            generated_at: new Date().toISOString(),
            compare_year: query.compareYear,
            history_days: historyDays,
            price_history: stepsByRoom.size ? 'recorded' : 'current_only',
            control_threshold: CONTROL_THRESHOLD,
        },
        occupancy_series,
        pace_norm_series: paceNorm,
        price_series,
        bookings_series,
        comp_band,
        price_changes: markers,
        external_events,
        effect_table,
    };
    return { chart, summary, options };
}

function verdictSafe(above: number | null, controlSize: number) {
    if (controlSize < 1 || above == null) return 'neutral' as const;
    if (above > CONTROL_THRESHOLD) return 'confirmed' as const;
    if (above < -CONTROL_THRESHOLD) return 'bad' as const;
    return 'neutral' as const;
}

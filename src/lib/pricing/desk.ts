import { getDB } from '@/lib/db/getDB';
import { otaToSite } from './channels';
import { IP_COLLECTIONS } from './collections';
import { recommendPrice } from './engine';
import { buildMasterIdNightMap } from './lt';
import { bookingRoomId, computeRoomOccupancy, mergeOccupancy, type OccupancyBooking } from './occupancy';
import { formatPeriodRange, type PeriodId, resolvePeriodWindow } from './periods';
import {
    ensurePricingSeeded,
    getApifyBudget,
    getChannels,
    getGlobalTargets,
    getParameters,
    getRooms,
    getTemperature,
} from './seed';
import type {
    DeskClusterRow,
    DeskPayload,
    DeskRoomRow,
    IpParameterCell,
    IpRoom,
    OccupancySlice,
} from './types';

const BEDS24_WRITE_ENABLED = false as const;

function cellKey(cluster: string, period: PeriodId) {
    return `${cluster}::${period}`;
}

function median(arr: number[]): number | null {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

type Beds24FixedPrice = {
    roomId: number;
    firstNight?: string;
    lastNight?: string;
    roomPrice?: number;
    minNights?: number;
    roomPriceEnable?: boolean;
};

function isoToday(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function loadCurrentRoomPrices(startIso: string, endIso: string): Promise<Map<number, number>> {
    const db = await getDB();
    const docs = (await db
        .collection('prices')
        .find(
            {
                firstNight: { $lte: endIso },
                lastNight: { $gte: startIso },
                roomPrice: { $gt: 0 },
            },
            { projection: { roomId: 1, firstNight: 1, lastNight: 1, roomPrice: 1, minNights: 1, roomPriceEnable: 1 } },
        )
        .toArray()) as Beds24FixedPrice[];

    const todayIso = isoToday();
    const refIso = todayIso >= startIso && todayIso <= endIso ? todayIso : startIso;

    const byRoom = new Map<number, Beds24FixedPrice[]>();
    for (const doc of docs) {
        const roomId = Number(doc.roomId);
        if (!Number.isFinite(roomId)) continue;
        if (doc.roomPriceEnable === false) continue;
        const list = byRoom.get(roomId) || [];
        list.push(doc);
        byRoom.set(roomId, list);
    }

    const result = new Map<number, number>();
    for (const [roomId, rules] of byRoom) {
        const covering = rules.filter(
            (r) => String(r.firstNight || '') <= refIso && String(r.lastNight || '') >= refIso,
        );
        const pool = covering.length ? covering : rules;
        pool.sort((a, b) => {
            const minA = Number(a.minNights ?? 1);
            const minB = Number(b.minNights ?? 1);
            if (minA !== minB) return minA - minB;
            return Number(a.roomPrice) - Number(b.roomPrice);
        });
        const price = Number(pool[0]?.roomPrice);
        if (Number.isFinite(price) && price > 0) result.set(roomId, price);
    }
    return result;
}

async function loadBookings(): Promise<OccupancyBooking[]> {
    const db = await getDB();
    const rows = await db
        .collection('bookings')
        .find(
            { status: { $in: ['confirmed', 'new', 'black'] } },
            {
                projection: {
                    id: 1,
                    masterId: 1,
                    roomId: 1,
                    roomID: 1,
                    status: 1,
                    arrival: 1,
                    departure: 1,
                    firstName: 1,
                    lastName: 1,
                    comments: 1,
                    notes: 1,
                },
            },
        )
        .toArray();
    return rows as unknown as OccupancyBooking[];
}

async function competitorAnchors(roomIds: number[], channels: Awaited<ReturnType<typeof getChannels>>) {
    const db = await getDB();
    const members = await db
        .collection(IP_COLLECTIONS.competitors)
        .find({ roomId: { $in: roomIds }, status: 'approved' })
        .toArray();

    const countByRoom = new Map<number, number>();
    for (const m of members) {
        countByRoom.set(m.roomId, (countByRoom.get(m.roomId) ?? 0) + 1);
    }

    const pricesByRoom = new Map<number, number[]>();
    const snapshots = await db
        .collection(IP_COLLECTIONS.snapshots)
        .find({ roomId: { $in: roomIds } })
        .sort({ createdAt: -1 })
        .limit(2000)
        .toArray();

    for (const snap of snapshots) {
        if (!snap.pricePerNightNorm || snap.availabilityStatus === 'strategic_hold') continue;
        const roomId = Number(snap.roomId);
        if (!pricesByRoom.has(roomId)) pricesByRoom.set(roomId, []);
        const site = otaToSite(Number(snap.pricePerNightNorm), snap.platform || 'airbnb', channels);
        pricesByRoom.get(roomId)!.push(site);
    }

    const individual = new Map<number, number | null>();
    for (const roomId of roomIds) {
        const prices = pricesByRoom.get(roomId) || [];
        const live = countByRoom.get(roomId) ?? 0;
        if (live >= 5 && prices.length >= 5) {
            const med = median(prices);
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            const spread = med ? (max - min) / med : 1;
            individual.set(roomId, spread <= 0.8 ? med : null);
        } else {
            individual.set(roomId, null);
        }
    }

    return { countByRoom, individual, medianByRoom: new Map([...pricesByRoom].map(([id, p]) => [id, median(p)])) };
}

export async function buildDesk(
    period: PeriodId,
    daysToArrival?: number,
    useCompetitors = true,
    year?: number,
): Promise<DeskPayload> {
    await ensurePricingSeeded();

    const window = resolvePeriodWindow(period, year);
    const D = daysToArrival == null ? window.daysToArrival : daysToArrival;
    const [rooms, params, temperature, channels, targets, bookings, currentPrices] = await Promise.all([
        getRooms(),
        getParameters(),
        getTemperature(),
        getChannels(),
        getGlobalTargets(window.year),
        loadBookings(),
        loadCurrentRoomPrices(window.startIso, window.endIso),
    ]);
    await getApifyBudget();

    const paramMap = new Map<string, IpParameterCell>();
    for (const cell of params) paramMap.set(cellKey(cell.cluster, cell.period), cell);

    const chain = buildMasterIdNightMap(bookings);
    const byRoom = new Map<number, OccupancyBooking[]>();
    for (const b of bookings) {
        const id = bookingRoomId(b);
        if (id == null) continue;
        const list = byRoom.get(id) || [];
        list.push(b);
        byRoom.set(id, list);
    }

    const assigned = rooms.filter((r) => r.cluster && !r.needsOnboarding);
    const seenAssigned = new Set<number>();
    const uniqueAssigned = assigned.filter((room) => {
        if (seenAssigned.has(room.roomId)) return false;
        seenAssigned.add(room.roomId);
        return true;
    });
    const { countByRoom, individual, medianByRoom } = await competitorAnchors(
        uniqueAssigned.map((r) => r.roomId),
        channels,
    );

    const occTarget = targets[period] ?? 0;
    const groups = new Map<string, IpRoom[]>();
    for (const room of uniqueAssigned) {
        const list = groups.get(room.cluster) || [];
        list.push(room);
        groups.set(room.cluster, list);
    }

    const clusters: DeskClusterRow[] = [];
    const companySlices: OccupancySlice[] = [];

    for (const [clusterName, clusterRooms] of groups) {
        const cell = paramMap.get(cellKey(clusterName, period));
        if (!cell) continue;
        const occTargetPct = occTarget || cell.occNorm;
        const hardFloor = clusterRooms.find((r) => r.floor)?.floor || 0;

        const prepared = clusterRooms.map((room) => {
            const occupancy = computeRoomOccupancy({
                units: room.units,
                periodStartIso: window.startIso,
                periodEndIso: window.endIso,
                periodNights: window.nights,
                bookings: byRoom.get(room.roomId) || [],
                chainNights: chain,
            });
            const ownAnchor = useCompetitors ? individual.get(room.roomId) ?? null : null;
            const roomMedian = useCompetitors ? medianByRoom.get(room.roomId) ?? null : null;
            return { room, occupancy, ownAnchor, roomMedian };
        });
        for (const p of prepared) companySlices.push(p.occupancy);

        const reliableAnchors = prepared
            .map((p) => p.ownAnchor)
            .filter((v): v is number => v != null);

        const clusterOcc = mergeOccupancy(prepared.map((p) => p.occupancy));
        const clusterAnchor =
            useCompetitors && reliableAnchors.length >= 3
                ? reliableAnchors.sort((a, b) => a - b)[Math.floor(reliableAnchors.length / 2)]
                : null;

        const clusterRec = recommendPrice({
            cell,
            daysToArrival: D,
            occNowPct: clusterOcc.otbPct,
            occTargetPct,
            competitor: clusterAnchor,
            temperature,
            channels,
            hardFloor,
        });

        const deskRooms: DeskRoomRow[] = prepared.map(({ room, occupancy, ownAnchor, roomMedian }) => {
            let anchorMode: DeskRoomRow['anchorMode'] = 'none';
            let competitor: number | null = null;
            if (ownAnchor != null) {
                competitor = ownAnchor;
                anchorMode = 'individual';
            } else if (clusterAnchor != null) {
                competitor = clusterAnchor;
                anchorMode = 'cluster';
            } else if (roomMedian != null) {
                competitor = roomMedian;
                anchorMode = 'none';
            }

            const rec = occupancy.lt
                ? {
                      ...clusterRec,
                      target: 0,
                      action: 'hold' as const,
                      actionLabel: 'долг. аренда — вне ценообразования',
                      reason: 'Период закрыт долгосрочной арендой. Рекомендация не считается, набор конкурентов не снимается.',
                  }
                : recommendPrice({
                      cell,
                      daysToArrival: D,
                      occNowPct: occupancy.otbPct,
                      occTargetPct,
                      competitor: useCompetitors ? competitor : null,
                      temperature,
                      channels,
                      hardFloor: room.floor || hardFloor,
                  });

            const flags: DeskRoomRow['flags'] = [];
            if (occupancy.otbPct < 0.4 * Math.max(clusterOcc.otbPct, 1)) flags.push('low');
            if (occupancy.otbPct > 85) flags.push('hot');
            if ((countByRoom.get(room.roomId) ?? 0) === 0) flags.push('nocs');
            if (occupancy.lt) flags.push('lt');
            if (room.source === 'live' && room.needsOnboarding) flags.push('new');

            return {
                roomId: room.roomId,
                name: room.name,
                units: room.units,
                occupancy,
                recommendation: rec,
                override: null,
                appliedPrice: null,
                currentPrice: currentPrices.get(room.roomId) ?? null,
                competitorCount: countByRoom.get(room.roomId) ?? 0,
                anchorMode,
                flags,
            };
        });

        clusters.push({
            cluster: clusterName,
            units: clusterRooms.reduce((s, r) => s + r.units, 0),
            regime: cell.regime,
            quality: cell.quality,
            occupancy: clusterOcc,
            recommendation: clusterRec,
            competitor: clusterAnchor,
            currentPrice: null,
            rooms: deskRooms,
        });
    }

    clusters.sort((a, b) => a.cluster.localeCompare(b.cluster));
    const company = mergeOccupancy(companySlices);

    const db = await getDB();
    const overrides = await db.collection(IP_COLLECTIONS.overrides).find({ period }).toArray();
    const accepted = await db.collection(IP_COLLECTIONS.accepted).find({ period }).toArray();
    const ovMap = new Map<number, number>();
    for (const o of overrides) {
        if (o.year != null && Number(o.year) !== window.year) continue;
        ovMap.set(Number(o.roomId), Number(o.price));
    }
    for (const o of overrides) {
        if (Number(o.year) === window.year) ovMap.set(Number(o.roomId), Number(o.price));
    }
    const accMap = new Map<number, number>();
    for (const o of accepted) {
        if (o.year != null && Number(o.year) !== window.year) continue;
        accMap.set(Number(o.roomId), Number(o.price));
    }
    for (const o of accepted) {
        if (Number(o.year) === window.year) accMap.set(Number(o.roomId), Number(o.price));
    }
    for (const cl of clusters) {
        for (const room of cl.rooms) {
            if (ovMap.has(room.roomId)) {
                room.override = ovMap.get(room.roomId) ?? null;
                room.flags.push('override');
            }
            if (accMap.has(room.roomId)) {
                room.appliedPrice = accMap.get(room.roomId) ?? null;
            }
            if (room.currentPrice == null && room.appliedPrice != null) {
                room.currentPrice = room.appliedPrice;
            }
        }
        const priced = cl.rooms.map((r) => r.currentPrice).filter((v): v is number => v != null);
        cl.currentPrice = median(priced);
    }

    return {
        period,
        periodLabel: formatPeriodRange(window.start, window.end),
        year: window.year,
        window: { start: window.startIso, end: window.endIso, nights: window.nights },
        daysToArrival: D,
        companyOtbPct: company.otbPct,
        useCompetitors,
        temperature,
        clusters,
        beds24WriteEnabled: BEDS24_WRITE_ENABLED,
    };
}

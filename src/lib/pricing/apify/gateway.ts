import { getDB } from '@/lib/db/getDB';
import { IP_COLLECTIONS } from '../collections';
import type { CompetitorPlatform } from '../types';
import { assertCanRun, recordCost } from './budget';
import { MONITOR_STAY_NIGHTS, actorById, extractNightlyPrice, extractRating, monitorActorFor, monitorInput } from './registry';
import { ObjectId } from 'mongodb';

const APIFY_BASE = 'https://api.apify.com/v2';

function token(): string {
    const t = process.env.APIFY_TOKEN;
    if (!t) throw new Error('APIFY_TOKEN is not set');
    return t;
}

async function apifyGet(path: string) {
    const res = await fetch(`${APIFY_BASE}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token())}`);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Apify GET ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
}

async function apifyPost(path: string, body: unknown) {
    const res = await fetch(`${APIFY_BASE}${path}?token=${encodeURIComponent(token())}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Apify POST ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
}

export async function abortRun(runId: string): Promise<void> {
    try {
        await apifyPost(`/actor-runs/${runId}/abort`, {});
    } catch {
        // already finished
    }
}

export async function runActorOnce(params: {
    actorId: string;
    input: unknown;
    platform: string;
    cluster?: string;
    roomId?: number | null;
    url?: string;
    userName: string;
    timeoutMs: number;
}): Promise<{ runId: string; status: string; items: Record<string, unknown>[]; costUsd: number }> {
    const started = await apifyPost(`/acts/${encodeURIComponent(params.actorId)}/runs`, params.input);
    const runId = started.data?.id as string;
    const db = await getDB();
    await db.collection(IP_COLLECTIONS.apifyRuns).insertOne({
        runId,
        actorId: params.actorId,
        platform: params.platform,
        cluster: params.cluster || null,
        roomId: params.roomId ?? null,
        url: params.url || null,
        status: 'RUNNING',
        startedAt: new Date(),
        finishedAt: null,
        abortedReason: null,
        itemsReturned: 0,
        userName: params.userName,
    });

    let run = started.data;
    const deadline = Date.now() + params.timeoutMs;
    while (run?.status === 'RUNNING' || run?.status === 'READY') {
        if (Date.now() > deadline) {
            await abortRun(runId);
            await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
                { runId },
                { $set: { status: 'ABORTED', abortedReason: 'timeout', finishedAt: new Date() } },
            );
            throw new Error(`Таймаут Apify, прогон ${runId} остановлен`);
        }
        await new Promise((r) => setTimeout(r, 4000));
        const polled = await apifyGet(`/actor-runs/${runId}`);
        run = polled.data;
    }

    const datasetId = run?.defaultDatasetId as string | undefined;
    const costUsd = Number(run?.usageTotalUsd || run?.stats?.costUsd || 0);
    if (run?.status !== 'SUCCEEDED' || !datasetId) {
        await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
            { runId },
            { $set: { status: run?.status || 'FAILED', finishedAt: new Date(), itemsReturned: 0 } },
        );
        return { runId, status: String(run?.status || 'FAILED'), items: [], costUsd };
    }

    const dataset = await apifyGet(`/datasets/${datasetId}/items?clean=true&limit=50`);
    const items: Record<string, unknown>[] = Array.isArray(dataset) ? dataset : dataset.items || [];
    await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
        { runId },
        { $set: { status: 'SUCCEEDED', finishedAt: new Date(), itemsReturned: items.length } },
    );
    return { runId, status: 'SUCCEEDED', items, costUsd };
}

function addDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pickCheckDates(periodStart: string, periodEnd: string, count = 1): string[] {
    const start = new Date(`${periodStart}T00:00:00`);
    const end = new Date(`${periodEnd}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minStart = new Date(today);
    minStart.setDate(minStart.getDate() + 2);
    const from = start > minStart ? start : minStart;
    if (from > end) return [toIso(start)];
    const span = Math.max(0, Math.round((end.getTime() - from.getTime()) / 86400000));
    const offset = Math.min(3, Math.floor(span / 2));
    const first = new Date(from);
    first.setDate(first.getDate() + offset);
    const out = [toIso(first)];
    if (count > 1 && span > 10) {
        const second = new Date(first);
        second.setDate(second.getDate() + 8);
        if (second <= end) out.push(toIso(second));
    }
    return out.slice(0, count);
}

function classifyAvailability(item: Record<string, unknown>, checkIn: string, nightly: number | null): string {
    const priceObj = item.price as { label?: string; price?: unknown } | undefined;
    if (typeof priceObj?.label === 'string' && /specify check-in/i.test(priceObj.label)) return 'unavailable';
    const available = item.isAvailable ?? item.available ?? item.rooms;
    if (available === false || available === 0) {
        if (checkIn.endsWith('-01')) return 'strategic_hold';
        return 'unavailable';
    }
    if (nightly == null && available == null) return 'unavailable';
    return 'available';
}

export async function runMonitorForCompetitor(params: {
    competitorId: string;
    roomId?: number | null;
    cluster?: string | null;
    platform: CompetitorPlatform;
    url: string;
    periodStart: string;
    periodEnd: string;
    stayNights?: number;
    userName: string;
}) {
    const actor = monitorActorFor(params.platform);
    if (!actor) throw new Error(`Нет разрешённого актора для ${params.platform}`);
    if (!actorById(actor.id)) throw new Error('Актор не в реестре');

    const stays = params.stayNights ? [params.stayNights] : [...MONITOR_STAY_NIGHTS];
    const dates = pickCheckDates(params.periodStart, params.periodEnd, 1);
    if (!dates.length) throw new Error('Нет дат проверки внутри периода');
    const jobs = dates.flatMap((checkIn) => stays.map((nights) => ({ checkIn, nights })));

    const estimated = actor.estimatedUsd * jobs.length;
    const { settings } = await assertCanRun(estimated);

    const db = await getDB();
    const snapshots: Array<Record<string, unknown>> = [];
    let useful = 0;
    let costUsd = 0;

    for (const job of jobs) {
        const checkIn = job.checkIn;
        const stay = job.nights;
        const checkOut = addDays(checkIn, stay);
        const input = {
            ...monitorInput(params.platform, params.url, checkIn, checkOut, settings.maxItems),
            previewOutput: false,
        };

        const started = await apifyPost(`/acts/${encodeURIComponent(actor.id)}/runs`, input);
        const runId = started.data?.id as string;
        const runDoc = {
            runId,
            actorId: actor.id,
            platform: params.platform,
            roomId: params.roomId,
            url: params.url,
            checkIn,
            checkOut,
            status: 'RUNNING',
            startedAt: new Date(),
            finishedAt: null as Date | null,
            abortedReason: null as string | null,
            itemsReturned: 0,
            userName: params.userName,
        };
        await db.collection(IP_COLLECTIONS.apifyRuns).insertOne(runDoc);

        const deadline = Date.now() + settings.timeoutMs;
        let run = started.data;
        while (run?.status === 'RUNNING' || run?.status === 'READY') {
            if (Date.now() > deadline) {
                await abortRun(runId);
                await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
                    { runId },
                    { $set: { status: 'ABORTED', abortedReason: 'timeout', finishedAt: new Date() } },
                );
                throw new Error(`Таймаут Apify, прогон ${runId} остановлен`);
            }
            await new Promise((r) => setTimeout(r, 4000));
            const polled = await apifyGet(`/actor-runs/${runId}`);
            run = polled.data;
        }

        const datasetId = run?.defaultDatasetId;
        const usageUsd = Number(run?.usageTotalUsd || run?.stats?.costUsd || actor.estimatedUsd);
        costUsd += usageUsd;

        if (run?.status !== 'SUCCEEDED' || !datasetId) {
            await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
                { runId },
                { $set: { status: run?.status || 'FAILED', finishedAt: new Date(), itemsReturned: 0 } },
            );
            continue;
        }

        const dataset = await apifyGet(`/datasets/${datasetId}/items?clean=true&limit=${Math.max(settings.maxItems, 3)}`);
        const items: Record<string, unknown>[] = Array.isArray(dataset) ? dataset : dataset.items || [];
        if (!items.length) {
            await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
                { runId },
                { $set: { status: 'EMPTY', finishedAt: new Date(), itemsReturned: 0 } },
            );
            continue;
        }

        useful += items.length;
        for (const item of items) {
            const price = extractNightlyPrice(params.platform, item, stay);
            const { rating, reviews } = extractRating(params.platform, item);
            snapshots.push({
                competitorId: params.competitorId,
                cluster: params.cluster || null,
                roomId: params.roomId ?? null,
                platform: params.platform,
                url: params.url,
                checkIn,
                checkOut,
                stayNights: stay,
                priceRaw: item.price ?? item.priceNightly ?? item.priceInclVat ?? null,
                pricePerNightNorm: price,
                rating,
                reviews,
                availabilityStatus: classifyAvailability(item, checkIn, price),
                sourceField: params.platform === 'trip' ? 'priceInclVat' : 'price',
                runId,
                createdAt: new Date(),
            });
        }

        await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
            { runId },
            { $set: { status: 'SUCCEEDED', finishedAt: new Date(), itemsReturned: items.length } },
        );
    }

    const warnings: string[] = [];
    const priced = snapshots.filter((s) => typeof s.pricePerNightNorm === 'number' && Number(s.pricePerNightNorm) > 0);
    const rated = [...snapshots].reverse().find((s) => typeof s.rating === 'number');
    const reviewed = [...snapshots].reverse().find((s) => typeof s.reviews === 'number');
    if (!snapshots.length) warnings.push('no_data');
    if (!priced.length) warnings.push('no_price');
    if (!rated) warnings.push('no_rating');
    if (!reviewed) warnings.push('no_reviews');
    if (snapshots.length && snapshots.every((s) => s.availabilityStatus !== 'available')) warnings.push('unavailable');

    const last = priced[priced.length - 1] || snapshots[snapshots.length - 1];
    const priceByStay: Partial<Record<14 | 20, number>> = {};
    for (const snap of priced) {
        const n = Number(snap.stayNights);
        if (n === 14 || n === 20) priceByStay[n] = Number(snap.pricePerNightNorm);
    }
    const lastPrice = priceByStay[14] ?? priceByStay[20] ?? (last?.pricePerNightNorm as number | undefined) ?? null;
    const lastStay = priceByStay[14] != null ? 14 : priceByStay[20] != null ? 20 : Number(last?.stayNights) || null;
    const now = new Date();

    if (snapshots.length) {
        await db.collection(IP_COLLECTIONS.snapshots).insertMany(snapshots);
    }
    await db.collection(IP_COLLECTIONS.competitors).updateOne(
        { _id: new ObjectId(params.competitorId) },
        {
            $set: {
                lastPrice,
                lastStayNights: lastStay,
                lastPriceByStay: priceByStay,
                lastAvailability: last?.availabilityStatus ?? null,
                lastRating: rated?.rating ?? null,
                lastReviews: reviewed?.reviews ?? rated?.reviews ?? null,
                lastWarnings: warnings,
                lastScrapedAt: now,
                updatedAt: now,
            },
        },
    );

    await recordCost({
        runId: `batch:${params.competitorId}:${Date.now()}`,
        actorId: actor.id,
        platform: params.platform,
        costUsd,
        usefulItems: useful,
        runType: 'manual',
        roomId: params.roomId ?? undefined,
        cluster: params.cluster || undefined,
    });

    return {
        dates,
        stays,
        snapshots: snapshots.length,
        useful,
        costUsd,
        lastPrice,
        lastRating: rated?.rating ?? null,
        lastReviews: reviewed?.reviews ?? null,
        warnings,
    };
}

export async function abortAllRunning(): Promise<number> {
    const db = await getDB();
    const running = await db.collection(IP_COLLECTIONS.apifyRuns).find({ status: 'RUNNING' }).toArray();
    for (const run of running) {
        if (run.runId) await abortRun(String(run.runId));
    }
    await db.collection(IP_COLLECTIONS.apifyRuns).updateMany(
        { status: 'RUNNING' },
        { $set: { status: 'ABORTED', abortedReason: 'stop-switch', finishedAt: new Date() } },
    );
    return running.length;
}

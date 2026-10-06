import { getDB } from '@/lib/db/getDB';
import { IP_COLLECTIONS } from '../collections';
import type { CompetitorPlatform } from '../types';
import { assertCanRun, recordCost } from './budget';
import {
    MONITOR_STAY_NIGHTS,
    actorById,
    extractNightlyPrice,
    extractRating,
    monitorActorFor,
    monitorInput,
    prepareTripListingUrl,
} from './registry';
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

const DATE_STEP_DAYS = 3;
const MAX_DATE_TRIES = 4;

/** Несколько заездов внутри периода. Если выбранные даты заняты, следующий заезд через несколько дней. */
function candidateCheckIns(periodStart: string, periodEnd: string): string[] {
    const start = new Date(`${periodStart}T00:00:00`);
    const end = new Date(`${periodEnd}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minStart = new Date(today);
    minStart.setDate(minStart.getDate() + 2);
    let from = start > minStart ? start : minStart;
    let limit = end;
    if (from > end) {
        from = minStart;
        limit = new Date(from);
        limit.setDate(limit.getDate() + 21);
    }
    const out: string[] = [];
    const cursor = new Date(from);
    while (cursor <= limit && out.length < 8) {
        out.push(toIso(cursor));
        cursor.setDate(cursor.getDate() + DATE_STEP_DAYS);
    }
    return out.length ? out : [toIso(minStart)];
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
    const dates = candidateCheckIns(params.periodStart, params.periodEnd);
    if (!dates.length) throw new Error('Нет дат проверки внутри периода');

    const db = await getDB();
    let listingUrl = params.url;
    if (params.platform === 'trip') {
        const prepared = await prepareTripListingUrl(params.url);
        if (!prepared.ok) {
            const now = new Date();
            await db.collection(IP_COLLECTIONS.competitors).updateOne(
                { _id: new ObjectId(params.competitorId) },
                { $set: { lastWarnings: ['bad_url'], lastScrapedAt: now, updatedAt: now } },
            );
            return {
                dates: [],
                stays,
                snapshots: 0,
                useful: 0,
                costUsd: 0,
                lastPrice: null,
                lastRating: null,
                lastReviews: null,
                warnings: ['bad_url'],
            };
        }
        listingUrl = prepared.url;
        if (listingUrl !== params.url) {
            const dup = await db.collection(IP_COLLECTIONS.competitors).findOne({
                cluster: params.cluster || null,
                url: listingUrl,
                _id: { $ne: new ObjectId(params.competitorId) },
            });
            if (!dup) {
                await db.collection(IP_COLLECTIONS.competitors).updateOne(
                    { _id: new ObjectId(params.competitorId) },
                    { $set: { url: listingUrl } },
                );
            }
        }
    }

    const budget = await assertCanRun(actor.estimatedUsd * stays.length);
    const settings = budget.settings;
    let pendingUsd = actor.estimatedUsd * stays.length;

    const snapshots: Array<Record<string, unknown>> = [];
    let useful = 0;
    let costUsd = 0;
    const usedDates: string[] = [];
    let prepaid = stays.length;

    const affordAnother = () => {
        const next = actor.estimatedUsd;
        if (next > settings.perRunUsd) return false;
        if (budget.daySpent + pendingUsd + next > settings.perDayUsd) return false;
        if (budget.monthSpent + pendingUsd + next > settings.perMonthUsd) return false;
        pendingUsd += next;
        return true;
    };

    const scrapeOnce = async (checkIn: string, stay: number) => {
        const checkOut = addDays(checkIn, stay);
        const input = {
            ...monitorInput(params.platform, listingUrl, checkIn, checkOut, settings.maxItems),
            previewOutput: false,
        };
        const started = await apifyPost(`/acts/${encodeURIComponent(actor.id)}/runs`, input);
        const runId = started.data?.id as string;
        await db.collection(IP_COLLECTIONS.apifyRuns).insertOne({
            runId,
            actorId: actor.id,
            platform: params.platform,
            roomId: params.roomId,
            url: listingUrl,
            checkIn,
            checkOut,
            status: 'RUNNING',
            startedAt: new Date(),
            finishedAt: null as Date | null,
            abortedReason: null as string | null,
            itemsReturned: 0,
            userName: params.userName,
        });

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
        costUsd += Number(run?.usageTotalUsd || run?.stats?.costUsd || actor.estimatedUsd);
        const batch: Array<Record<string, unknown>> = [];

        if (run?.status !== 'SUCCEEDED' || !datasetId) {
            await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
                { runId },
                { $set: { status: run?.status || 'FAILED', finishedAt: new Date(), itemsReturned: 0 } },
            );
            return batch;
        }

        const dataset = await apifyGet(`/datasets/${datasetId}/items?clean=true&limit=${Math.max(settings.maxItems, 3)}`);
        const items: Record<string, unknown>[] = Array.isArray(dataset) ? dataset : dataset.items || [];
        if (!items.length) {
            await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
                { runId },
                { $set: { status: 'EMPTY', finishedAt: new Date(), itemsReturned: 0 } },
            );
            return batch;
        }

        useful += items.length;
        for (const item of items) {
            const price = extractNightlyPrice(params.platform, item, stay);
            const { rating, reviews } = extractRating(params.platform, item);
            batch.push({
                competitorId: params.competitorId,
                cluster: params.cluster || null,
                roomId: params.roomId ?? null,
                platform: params.platform,
                url: listingUrl,
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
        return batch;
    };

    const hasNightly = (batch: Array<Record<string, unknown>>) =>
        batch.some(
            (s) =>
                s.availabilityStatus === 'available' &&
                typeof s.pricePerNightNorm === 'number' &&
                Number(s.pricePerNightNorm) > 0,
        );

    for (const stay of stays) {
        let won = false;
        let lastBatch: Array<Record<string, unknown>> = [];
        const tries = dates.slice(0, MAX_DATE_TRIES);
        for (let i = 0; i < tries.length; i += 1) {
            if (prepaid > 0) prepaid -= 1;
            else if (!affordAnother()) break;
            const checkIn = tries[i];
            usedDates.push(checkIn);
            const batch = await scrapeOnce(checkIn, stay);
            lastBatch = batch;
            if (hasNightly(batch)) {
                snapshots.push(...batch);
                won = true;
                break;
            }
        }
        if (!won && lastBatch.length) snapshots.push(...lastBatch);
    }

    const warnings: string[] = [];
    const priced = snapshots.filter(
        (s) =>
            s.availabilityStatus === 'available' &&
            typeof s.pricePerNightNorm === 'number' &&
            Number(s.pricePerNightNorm) > 0,
    );
    const rated = [...snapshots].reverse().find((s) => typeof s.rating === 'number');
    const reviewed = [...snapshots].reverse().find((s) => typeof s.reviews === 'number');
    if (!snapshots.length) warnings.push('no_data');
    if (!priced.length) warnings.push('no_price');
    if (!rated) warnings.push('no_rating');
    if (!reviewed) warnings.push('no_reviews');
    if (snapshots.length && snapshots.every((s) => s.availabilityStatus !== 'available')) warnings.push('unavailable');

    const last = priced[priced.length - 1] || snapshots[snapshots.length - 1];
    const priceByStay: Partial<Record<7 | 20, number>> = {};
    for (const snap of priced) {
        const n = Number(snap.stayNights);
        if (n === 7 || n === 20) priceByStay[n] = Number(snap.pricePerNightNorm);
    }
    const lastPrice = priceByStay[7] ?? priceByStay[20] ?? (last?.pricePerNightNorm as number | undefined) ?? null;
    const lastStay = priceByStay[7] != null ? 7 : priceByStay[20] != null ? 20 : Number(last?.stayNights) || null;
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
        dates: usedDates,
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

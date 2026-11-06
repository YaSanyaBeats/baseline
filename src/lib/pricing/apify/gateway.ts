import { getDB } from '@/lib/db/getDB';
import { IP_COLLECTIONS } from '../collections';
import type { CompetitorPlatform } from '../types';
import { ApifyBudgetError, assertCanRun, recordCost } from './budget';
import { normalizeCompetitorUrl } from '../competitors';
import {
    addIsoDays,
    fallbackStay,
    firstNightInPeriod,
    laterNightInPeriod,
    summarizeNightly,
    type NightlySample,
} from './nightly';
import {
    actorById,
    extractNightlyPrice,
    extractRating,
    monitorActorFor,
    monitorInputForUrls,
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

/** Ключ для сопоставления URL конкурента с результатом Apify. */
export function listingMatchKey(raw: string): string {
    const n = normalizeCompetitorUrl(raw).toLowerCase();
    const airbnb = n.match(/\/rooms\/(\d+)/);
    if (airbnb) return `airbnb:${airbnb[1]}`;
    const booking = n.match(/booking\.com\/hotel\/[^/]+\/([^.?/]+)/);
    if (booking) return `booking:${booking[1]}`;
    return n;
}

function itemListingUrl(item: Record<string, unknown>): string {
    const candidates = [item.url, item.listingUrl, item.hotelUrl, item.shareUrl, item.link];
    for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) return c.trim();
    }
    if (typeof item.id === 'number' || typeof item.id === 'string') {
        const id = String(item.id);
        if (/^\d+$/.test(id)) return `https://www.airbnb.com/rooms/${id}`;
    }
    return '';
}

type ProbeTarget = {
    _id: string;
    url: string;
    listingUrl: string;
    persistUrl: boolean;
    roomId?: number | null;
    cluster?: string | null;
};

type ProbeAccum = {
    samples: NightlySample[];
    rating: number | null;
    reviews: number | null;
    availability: string | null;
    sawItem: boolean;
};

function emptyAccum(): ProbeAccum {
    return { samples: [], rating: null, reviews: null, availability: null, sawItem: false };
}

async function runStayBatch(params: {
    actorId: string;
    estimatedUsd: number;
    platform: CompetitorPlatform;
    urls: string[];
    checkIn: string;
    stay: number;
    cluster?: string | null;
    userName: string;
    timeoutMs: number;
    maxItems: number;
}): Promise<{ runId: string; costUsd: number; items: Record<string, unknown>[]; checkOut: string }> {
    const checkOut = addIsoDays(params.checkIn, params.stay);
    const input = {
        ...monitorInputForUrls(params.platform, params.urls, params.checkIn, checkOut, params.maxItems),
        previewOutput: false,
    };
    const db = await getDB();
    const started = await apifyPost(`/acts/${encodeURIComponent(params.actorId)}/runs`, input);
    const runId = started.data?.id as string;
    await db.collection(IP_COLLECTIONS.apifyRuns).insertOne({
        runId,
        actorId: params.actorId,
        platform: params.platform,
        cluster: params.cluster || null,
        roomId: null,
        url: params.urls.join(' | '),
        urls: params.urls,
        checkIn: params.checkIn,
        checkOut,
        status: 'RUNNING',
        startedAt: new Date(),
        finishedAt: null as Date | null,
        abortedReason: null as string | null,
        itemsReturned: 0,
        userName: params.userName,
    });

    const deadline = Date.now() + Math.max(params.timeoutMs, params.timeoutMs * Math.ceil(params.urls.length / 5));
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

    const costUsd = Number(run?.usageTotalUsd || run?.stats?.costUsd || params.estimatedUsd);
    const datasetId = run?.defaultDatasetId;
    if (run?.status !== 'SUCCEEDED' || !datasetId) {
        await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
            { runId },
            { $set: { status: run?.status || 'FAILED', finishedAt: new Date(), itemsReturned: 0 } },
        );
        return { runId, costUsd, items: [], checkOut };
    }

    const dataset = await apifyGet(
        `/datasets/${datasetId}/items?clean=true&limit=${Math.max(params.maxItems, params.urls.length * 2, 10)}`,
    );
    const items: Record<string, unknown>[] = Array.isArray(dataset) ? dataset : dataset.items || [];
    await db.collection(IP_COLLECTIONS.apifyRuns).updateOne(
        { runId },
        { $set: { status: items.length ? 'SUCCEEDED' : 'EMPTY', finishedAt: new Date(), itemsReturned: items.length } },
    );
    return { runId, costUsd, items, checkOut };
}

function absorbItems(params: {
    platform: CompetitorPlatform;
    targets: ProbeTarget[];
    items: Record<string, unknown>[];
    checkIn: string;
    checkOut: string;
    stay: number;
    runId: string;
    cluster?: string | null;
    accums: Map<string, ProbeAccum>;
}): Record<string, unknown>[] {
    const byKey = new Map<string, Record<string, unknown>>();
    for (const item of params.items) {
        const key = listingMatchKey(itemListingUrl(item));
        if (key) byKey.set(key, item);
    }
    const matched = new Map<string, Record<string, unknown>>();
    for (const target of params.targets) {
        const item = byKey.get(listingMatchKey(target.listingUrl));
        if (item) matched.set(target._id, item);
    }
    if (params.targets.length === 1 && !matched.size && params.items[0]) {
        matched.set(params.targets[0]._id, params.items[0]);
    }

    const snapshots: Record<string, unknown>[] = [];
    for (const target of params.targets) {
        const item = matched.get(target._id);
        if (!item) continue;
        const acc = params.accums.get(target._id) || emptyAccum();
        params.accums.set(target._id, acc);
        acc.sawItem = true;
        const price = extractNightlyPrice(params.platform, item, params.stay);
        const { rating, reviews } = extractRating(params.platform, item);
        const availabilityStatus = classifyAvailability(item, params.checkIn, price);
        if (rating != null) acc.rating = rating;
        if (reviews != null) acc.reviews = reviews;
        acc.availability = availabilityStatus;
        if (availabilityStatus === 'available' && typeof price === 'number' && price > 0) {
            acc.samples.push({
                checkIn: params.checkIn,
                checkOut: params.checkOut,
                stayNights: params.stay,
                nightly: price,
            });
        }
        snapshots.push({
            competitorId: target._id,
            cluster: target.cluster || params.cluster || null,
            roomId: target.roomId ?? null,
            platform: params.platform,
            url: target.listingUrl,
            checkIn: params.checkIn,
            checkOut: params.checkOut,
            stayNights: params.stay,
            priceRaw: item.price ?? item.priceNightly ?? item.priceInclVat ?? null,
            pricePerNightNorm: price,
            rating,
            reviews,
            availabilityStatus,
            sourceField: params.platform === 'trip' ? 'priceInclVat' : 'price',
            runId: params.runId,
            createdAt: new Date(),
        });
    }
    return snapshots;
}

function probeWarnings(acc: ProbeAccum, warnDetails: boolean): string[] {
    const summary = summarizeNightly(acc.samples);
    const warnings: string[] = [];
    if (!acc.sawItem) warnings.push('no_data');
    if (summary.average == null) warnings.push('no_price');
    if (warnDetails && acc.rating == null) warnings.push('no_rating');
    if (warnDetails && acc.reviews == null) warnings.push('no_reviews');
    if (acc.sawItem && summary.average == null && acc.availability && acc.availability !== 'available') {
        warnings.push('unavailable');
    }
    return warnings;
}

async function saveProbeResults(
    targets: ProbeTarget[],
    accums: Map<string, ProbeAccum>,
    warnDetails: boolean,
    onlyIds?: Set<string>,
) {
    const db = await getDB();
    const now = new Date();
    for (const target of targets) {
        if (onlyIds && !onlyIds.has(target._id)) continue;
        const acc = accums.get(target._id) || emptyAccum();
        const summary = summarizeNightly(acc.samples);
        const last = acc.samples[acc.samples.length - 1];
        const first = acc.samples[0];
        const set: Record<string, unknown> = {
            lastWarnings: probeWarnings(acc, warnDetails),
            lastScrapedAt: now,
            updatedAt: now,
        };
        if (acc.sawItem) {
            set.lastRating = acc.rating;
            set.lastReviews = acc.reviews;
            set.lastAvailability = acc.availability;
        }
        if (target.persistUrl && target.listingUrl !== target.url) set.url = target.listingUrl;
        const update: { $set: Record<string, unknown>; $unset?: Record<string, ''> } = { $set: set };
        if (summary.average != null && first && last) {
            set.lastPrice = summary.average;
            set.scrapedPrice = summary.average;
            set.lastPriceMin = summary.min;
            set.lastPriceMax = summary.max;
            set.lastPriceSamples = acc.samples;
            set.lastStayNights = last.stayNights;
            set.lastCheckIn = first.checkIn;
            set.lastCheckOut = last.checkOut;
            set.priceSource = 'scrape';
            update.$unset = { lastPriceByStay: '' };
        }
        await db.collection(IP_COLLECTIONS.competitors).updateOne({ _id: new ObjectId(target._id) }, update);
    }
}

/**
 * Суточная цена внутри периода, не больше двух прогонов Apify на площадку.
 * 1) Первая свободная ночь. 2) Либо повтор для тех, у кого цены нет (проживание длиннее),
 * либо — если цена есть у всех и период длинный — ночь позже, чтобы увидеть сдвиг и среднее.
 */
async function probePlatform(params: {
    platform: CompetitorPlatform;
    targets: ProbeTarget[];
    periodStart: string;
    periodEnd: string;
    userName: string;
    cluster?: string | null;
    roomId?: number | null;
    warnDetails: boolean;
}): Promise<{ costUsd: number; useful: number; snapshots: number; accums: Map<string, ProbeAccum> }> {
    const actor = monitorActorFor(params.platform);
    if (!actor || !actorById(actor.id)) throw new Error(`Нет разрешённого актора для ${params.platform}`);
    const first = firstNightInPeriod(params.periodStart, params.periodEnd);
    if (!first) throw new Error('Нет дат проверки внутри периода');
    if (!params.targets.length) {
        return { costUsd: 0, useful: 0, snapshots: 0, accums: new Map() };
    }

    const db = await getDB();
    const accums = new Map<string, ProbeAccum>();
    let costUsd = 0;
    let useful = 0;
    let snapshots = 0;

    const execute = async (targets: ProbeTarget[], checkIn: string, stay: number) => {
        if (!targets.length) return;
        const budget = await assertCanRun(actor.estimatedUsd);
        const batch = await runStayBatch({
            actorId: actor.id,
            estimatedUsd: actor.estimatedUsd,
            platform: params.platform,
            urls: targets.map((t) => t.listingUrl),
            checkIn,
            stay,
            cluster: params.cluster,
            userName: params.userName,
            timeoutMs: budget.settings.timeoutMs,
            maxItems: budget.settings.maxItems,
        });
        costUsd += batch.costUsd;
        useful += batch.items.length;
        const snaps = absorbItems({
            platform: params.platform,
            targets,
            items: batch.items,
            checkIn,
            checkOut: batch.checkOut,
            stay,
            runId: batch.runId,
            cluster: params.cluster,
            accums,
        });
        if (snaps.length) {
            await db.collection(IP_COLLECTIONS.snapshots).insertMany(snaps);
            snapshots += snaps.length;
        }
    };

    await execute(params.targets, first, 1);
    const pricedIds = new Set(
        params.targets.filter((t) => (accums.get(t._id)?.samples.length ?? 0) > 0).map((t) => t._id),
    );
    if (pricedIds.size) await saveProbeResults(params.targets, accums, params.warnDetails, pricedIds);

    const missing = params.targets.filter((t) => !(accums.get(t._id)?.samples.length));
    let second = false;
    try {
        if (missing.length) {
            const retry = fallbackStay(first, params.periodStart, params.periodEnd);
            if (retry) {
                await execute(missing, retry.checkIn, retry.stayNights);
                second = true;
            }
        } else {
            const later = laterNightInPeriod(first, params.periodEnd);
            if (later) {
                await execute(params.targets, later, 1);
                second = true;
            }
        }
    } catch (error) {
        if (!(error instanceof ApifyBudgetError)) throw error;
    }

    if (second || missing.length) await saveProbeResults(params.targets, accums, params.warnDetails);

    await recordCost({
        runId: `probe:${params.cluster || params.targets[0]?._id || params.platform}:${params.platform}:${Date.now()}`,
        actorId: actor.id,
        platform: params.platform,
        costUsd,
        usefulItems: useful,
        runType: 'manual',
        roomId: params.roomId ?? undefined,
        cluster: params.cluster || undefined,
    });

    return { costUsd, useful, snapshots, accums };
}

export async function runMonitorForCompetitor(params: {
    competitorId: string;
    roomId?: number | null;
    cluster?: string | null;
    platform: CompetitorPlatform;
    url: string;
    periodStart: string;
    periodEnd: string;
    userName: string;
}) {
    const db = await getDB();
    let listingUrl = params.url;
    let persistUrl = false;
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
                stays: [],
                snapshots: 0,
                useful: 0,
                costUsd: 0,
                lastPrice: null,
                lastRating: null,
                lastReviews: null,
                warnings: ['bad_url'],
                checkIn: null,
                checkOut: null,
            };
        }
        listingUrl = prepared.url;
        if (listingUrl !== params.url) {
            const dup = await db.collection(IP_COLLECTIONS.competitors).findOne({
                cluster: params.cluster || null,
                url: listingUrl,
                _id: { $ne: new ObjectId(params.competitorId) },
            });
            persistUrl = !dup;
            if (!dup) {
                await db.collection(IP_COLLECTIONS.competitors).updateOne(
                    { _id: new ObjectId(params.competitorId) },
                    { $set: { url: listingUrl } },
                );
            }
        }
    }

    const probed = await probePlatform({
        platform: params.platform,
        targets: [
            {
                _id: params.competitorId,
                url: params.url,
                listingUrl,
                persistUrl,
                roomId: params.roomId,
                cluster: params.cluster,
            },
        ],
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        userName: params.userName,
        cluster: params.cluster,
        roomId: params.roomId,
        warnDetails: true,
    });

    const acc = probed.accums.get(params.competitorId) || emptyAccum();
    const summary = summarizeNightly(acc.samples);
    const last = acc.samples[acc.samples.length - 1];
    return {
        dates: [...new Set(acc.samples.map((s) => s.checkIn))],
        stays: [...new Set(acc.samples.map((s) => s.stayNights))],
        checkIn: acc.samples[0]?.checkIn || null,
        checkOut: last?.checkOut || null,
        snapshots: probed.snapshots,
        useful: probed.useful,
        costUsd: probed.costUsd,
        lastPrice: summary.average,
        lastRating: acc.rating,
        lastReviews: acc.reviews,
        warnings: probeWarnings(acc, true),
    };
}

type ClusterCompetitor = {
    _id: string;
    url: string;
    platform: CompetitorPlatform;
    name?: string;
    roomId?: number | null;
    cluster?: string | null;
};

/**
 * Съём одобренных конкурентов кластера: URL одной площадки — в одном Apify run.
 * Цель — суточная цена внутри выбранного периода, не больше двух прогонов на площадку.
 */
export async function runMonitorForCluster(params: {
    cluster: string;
    competitors: ClusterCompetitor[];
    periodStart: string;
    periodEnd: string;
    userName: string;
}) {
    const first = firstNightInPeriod(params.periodStart, params.periodEnd);
    if (!first) throw new Error('Нет дат проверки внутри периода');

    const byPlatform = new Map<CompetitorPlatform, ClusterCompetitor[]>();
    for (const c of params.competitors) {
        const list = byPlatform.get(c.platform) || [];
        list.push(c);
        byPlatform.set(c.platform, list);
    }

    const db = await getDB();
    let costUsd = 0;
    let useful = 0;
    const results: Array<{
        competitorId: string;
        success: boolean;
        costUsd: number;
        checkIn: string | null;
        checkOut: string | null;
        lastPrice: number | null;
        warnings: string[];
    }> = [];

    for (const [platform, comps] of byPlatform) {
        const actor = monitorActorFor(platform);
        if (!actor || !actorById(actor.id)) {
            for (const c of comps) {
                results.push({
                    competitorId: c._id,
                    success: false,
                    costUsd: 0,
                    checkIn: null,
                    checkOut: null,
                    lastPrice: null,
                    warnings: ['no_data'],
                });
            }
            continue;
        }

        const prepared: ProbeTarget[] = [];
        for (const c of comps) {
            let listingUrl = c.url;
            if (platform === 'trip') {
                const prep = await prepareTripListingUrl(c.url);
                if (!prep.ok) {
                    const now = new Date();
                    await db.collection(IP_COLLECTIONS.competitors).updateOne(
                        { _id: new ObjectId(c._id) },
                        { $set: { lastWarnings: ['bad_url'], lastScrapedAt: now, updatedAt: now } },
                    );
                    results.push({
                        competitorId: c._id,
                        success: false,
                        costUsd: 0,
                        checkIn: null,
                        checkOut: null,
                        lastPrice: null,
                        warnings: ['bad_url'],
                    });
                    continue;
                }
                listingUrl = prep.url;
            }
            prepared.push({
                _id: c._id,
                url: c.url,
                listingUrl,
                persistUrl: listingUrl !== c.url,
                roomId: c.roomId,
                cluster: params.cluster,
            });
        }
        if (!prepared.length) continue;

        const probed = await probePlatform({
            platform,
            targets: prepared,
            periodStart: params.periodStart,
            periodEnd: params.periodEnd,
            userName: params.userName,
            cluster: params.cluster,
            warnDetails: false,
        });
        costUsd += probed.costUsd;
        useful += probed.useful;

        for (const target of prepared) {
            const acc = probed.accums.get(target._id) || emptyAccum();
            const summary = summarizeNightly(acc.samples);
            const last = acc.samples[acc.samples.length - 1];
            results.push({
                competitorId: target._id,
                success: summary.average != null,
                costUsd: 0,
                checkIn: acc.samples[0]?.checkIn || null,
                checkOut: last?.checkOut || null,
                lastPrice: summary.average,
                warnings: summary.average == null ? probeWarnings(acc, false) : [],
            });
        }
    }

    return {
        cluster: params.cluster,
        stayNights: 1,
        dates: [first],
        done: results.filter((r) => r.success).length,
        total: params.competitors.length,
        costUsd,
        useful,
        results,
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

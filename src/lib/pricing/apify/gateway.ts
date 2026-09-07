import { getDB } from '@/lib/db/getDB';
import { IP_COLLECTIONS } from '../collections';
import type { CompetitorPlatform } from '../types';
import { assertCanRun, recordCost } from './budget';
import { DATASET_FIELDS, actorById, monitorActorFor, monitorInput } from './registry';
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

function addDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function pickCheckDates(periodStart: string, periodEnd: string): string[] {
    const start = new Date(`${periodStart}T00:00:00`);
    const end = new Date(`${periodEnd}T00:00:00`);
    const jitter = Math.floor(Math.random() * 3) - 1;
    const wanted = [2 + jitter, 10 + jitter, 20 + jitter];
    const out: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
        for (const day of wanted) {
            const d = new Date(cursor.getFullYear(), cursor.getMonth(), Math.max(1, day));
            if (d >= start && d <= end) {
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (!out.includes(iso)) out.push(iso);
            }
        }
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return out.slice(0, 3);
}

function classifyAvailability(item: Record<string, unknown>, checkIn: string): string {
    const available = item.isAvailable ?? item.available ?? item.rooms;
    if (available === false || available === 0) {
        if (checkIn.endsWith('-01')) return 'strategic_hold';
        return 'unavailable';
    }
    return 'available';
}

function normalizePrice(platform: CompetitorPlatform, item: Record<string, unknown>, nights: number): number | null {
    if (platform === 'airbnb') {
        const price = item.price as { price?: number; breakDown?: { basePrice?: { description?: string } } } | number | undefined;
        if (typeof price === 'number') return nights > 0 ? price / nights : price;
        if (price && typeof price.price === 'number') return nights > 0 ? price.price / nights : price.price;
        return null;
    }
    if (platform === 'booking') {
        const p = Number(item.price);
        return Number.isFinite(p) ? p : null;
    }
    if (platform === 'agoda') {
        const p = Number(item.priceNightly);
        return Number.isFinite(p) ? p : null;
    }
    const p = Number(item.priceInclVat);
    return Number.isFinite(p) ? p : null;
}

export async function runMonitorForCompetitor(params: {
    competitorId: string;
    roomId: number;
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

    const stay = params.stayNights ?? 7;
    const dates = pickCheckDates(params.periodStart, params.periodEnd);
    if (!dates.length) throw new Error('Нет дат проверки внутри периода');

    const estimated = actor.estimatedUsd * dates.length;
    const { settings } = await assertCanRun(estimated);

    const db = await getDB();
    const snapshots: Array<Record<string, unknown>> = [];
    let useful = 0;
    let costUsd = 0;

    for (const checkIn of dates) {
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

        const fields = DATASET_FIELDS[params.platform];
        const dataset = await apifyGet(`/datasets/${datasetId}/items?clean=true&fields=${encodeURIComponent(fields)}&limit=${settings.maxItems}`);
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
            const price = normalizePrice(params.platform, item, stay);
            snapshots.push({
                competitorId: params.competitorId,
                roomId: params.roomId,
                platform: params.platform,
                url: params.url,
                checkIn,
                checkOut,
                stayNights: stay,
                priceRaw: item.price ?? item.priceNightly ?? item.priceInclVat ?? null,
                pricePerNightNorm: price,
                availabilityStatus: classifyAvailability(item, checkIn),
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

    if (snapshots.length) {
        await db.collection(IP_COLLECTIONS.snapshots).insertMany(snapshots);
        const available = snapshots.filter((s) => s.availabilityStatus === 'available' && typeof s.pricePerNightNorm === 'number');
        const last = available[available.length - 1] || snapshots[snapshots.length - 1];
        await db.collection(IP_COLLECTIONS.competitors).updateOne(
            { _id: new ObjectId(params.competitorId) },
            {
                $set: {
                    lastPrice: last?.pricePerNightNorm ?? null,
                    lastAvailability: last?.availabilityStatus ?? null,
                    updatedAt: new Date(),
                },
            },
        );
    }

    await recordCost({
        runId: `batch:${params.competitorId}:${Date.now()}`,
        actorId: actor.id,
        platform: params.platform,
        costUsd,
        usefulItems: useful,
        runType: 'manual',
        roomId: params.roomId,
    });

    return { dates, snapshots: snapshots.length, useful, costUsd };
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

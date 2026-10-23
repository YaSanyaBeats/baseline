import { ObjectId, type MongoServerError } from 'mongodb';
import { after } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { IP_COLLECTIONS } from '../collections';
import { writePricingJournal } from '../journal';
import { PERIOD_IDS, resolvePeriodWindow, type PeriodId } from '../periods';
import { getApifyBudget } from '../seed';
import type { CompetitorPlatform } from '../types';
import { ApifyBudgetError } from './budget';
import { runMonitorForCluster, runMonitorForCompetitor } from './gateway';

/**
 * Съём не ждёт Apify в HTTP-ответе: задача пишется в Mongo и выполняется
 * в фоне того же Node-процесса. Иначе прокси обрывает долгий запрос с 504.
 */

const STALE_MS = 45_000;
const HEARTBEAT_MS = 10_000;
const ACTIVE = ['queued', 'running'] as const;

export type ScrapeJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export type ScrapeJobResult = {
    costUsd: number;
    warnings: string[];
    done: number;
    total: number;
};

export type ScrapeJobView = {
    id: string;
    kind: 'competitor' | 'cluster';
    status: ScrapeJobStatus;
    competitorId: string | null;
    cluster: string | null;
    period: string;
    error: string | null;
    result: ScrapeJobResult | null;
};

type ScrapeJobDoc = {
    _id: ObjectId;
    kind: 'competitor' | 'cluster';
    status: ScrapeJobStatus;
    competitorId: string | null;
    cluster: string | null;
    period: string;
    userId: string;
    userName: string;
    createdAt: Date;
    startedAt: Date | null;
    heartbeatAt: Date | null;
    finishedAt: Date | null;
    error: string | null;
    result: ScrapeJobResult | null;
    /** Есть только у queued/running. Уникальный sparse-индекс не даёт поставить дубль. */
    activeKey?: string;
};

type QueueState = {
    drain: Promise<void> | null;
    rerun: boolean;
    runningIds: Set<string>;
};

function queueState(): QueueState {
    const g = globalThis as typeof globalThis & { __ipScrapeQueue?: QueueState };
    if (!g.__ipScrapeQueue) {
        g.__ipScrapeQueue = { drain: null, rerun: false, runningIds: new Set() };
    }
    return g.__ipScrapeQueue;
}

let indexesReady: Promise<void> | null = null;

async function jobsCol() {
    const db = await getDB();
    return db.collection<ScrapeJobDoc>(IP_COLLECTIONS.scrapeJobs);
}

function ensureIndexes(): Promise<void> {
    if (!indexesReady) {
        indexesReady = (async () => {
            const col = await jobsCol();
            await col.createIndex({ activeKey: 1 }, { unique: true, sparse: true, name: 'uniq_active_scrape' });
        })().catch((error) => {
            indexesReady = null;
            console.error('[scrape-queue] index', error);
        });
    }
    return indexesReady;
}

function toView(doc: ScrapeJobDoc): ScrapeJobView {
    return {
        id: String(doc._id),
        kind: doc.kind,
        status: doc.status,
        competitorId: doc.competitorId,
        cluster: doc.cluster,
        period: doc.period,
        error: doc.error,
        result: doc.result,
    };
}

function isDuplicate(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as MongoServerError).code === 11000;
}

function periodOf(raw: string): PeriodId {
    return (PERIOD_IDS as readonly string[]).includes(raw) ? (raw as PeriodId) : 'P1';
}

function stopsTheQueue(error: unknown): boolean {
    if (!(error instanceof ApifyBudgetError)) return false;
    const message = error.message;
    return (
        message.includes('Дневной') ||
        message.includes('Месячный') ||
        message.includes('стоп-краном') ||
        message.includes('APIFY_TOKEN')
    );
}

export function kickScrapeQueue(): void {
    const state = queueState();
    if (state.drain) {
        state.rerun = true;
        return;
    }

    const run = (async () => {
        try {
            do {
                state.rerun = false;
                await failStaleJobs();
                const stopped = await processUntilEmpty();
                if (stopped) state.rerun = false;
            } while (state.rerun);
        } catch (error) {
            console.error('[scrape-queue]', error);
        } finally {
            state.drain = null;
            if (state.rerun) {
                state.rerun = false;
                kickScrapeQueue();
            }
        }
    })();

    state.drain = run;
    try {
        after(() => run);
    } catch {
        // Вне запроса промис уже запущен и живёт в процессе Node.
    }
}

async function failStaleJobs(): Promise<void> {
    const col = await jobsCol();
    const cutoff = new Date(Date.now() - STALE_MS);
    const exclude = [...queueState().runningIds].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    await col.updateMany(
        {
            status: 'running',
            ...(exclude.length ? { _id: { $nin: exclude } } : {}),
            $or: [{ heartbeatAt: { $lt: cutoff } }, { heartbeatAt: null }],
        },
        {
            $set: {
                status: 'failed',
                finishedAt: new Date(),
                error: 'Съём прерван. Запустите снова.',
            },
            $unset: { activeKey: '' },
        },
    );
}

async function processUntilEmpty(): Promise<boolean> {
    for (;;) {
        const settings = await getApifyBudget();
        if (!settings.scrapingEnabled) {
            await cancelQueuedScrapeJobs('Скрейпинг выключен стоп-краном.');
            return true;
        }
        const job = await claimNext();
        if (!job) return false;
        const stop = await executeJob(job);
        if (stop) return true;
    }
}

async function claimNext(): Promise<ScrapeJobDoc | null> {
    const col = await jobsCol();
    const now = new Date();
    const raw = await col.findOneAndUpdate(
        { status: 'queued' },
        { $set: { status: 'running', startedAt: now, heartbeatAt: now } },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
    );
    if (!raw || typeof raw !== 'object') return null;
    if ('ok' in raw && 'value' in raw) {
        return (raw.value as ScrapeJobDoc | null) ?? null;
    }
    return raw as ScrapeJobDoc;
}

async function executeJob(job: ScrapeJobDoc): Promise<boolean> {
    const state = queueState();
    const id = String(job._id);
    state.runningIds.add(id);
    const timer = setInterval(() => {
        void jobsCol().then((col) =>
            col.updateOne({ _id: job._id, status: 'running' }, { $set: { heartbeatAt: new Date() } }),
        );
    }, HEARTBEAT_MS);
    (timer as unknown as { unref?: () => void }).unref?.();

    try {
        if (job.kind === 'cluster') await runClusterJob(job);
        else await runCompetitorJob(job);
        return false;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка Apify';
        console.error('[scrape-queue]', id, message);
        await finishJob(job._id, 'failed', message, null);
        if (stopsTheQueue(error)) {
            await failQueuedJobs(message);
            return true;
        }
        return false;
    } finally {
        clearInterval(timer);
        state.runningIds.delete(id);
    }
}

async function runCompetitorJob(job: ScrapeJobDoc): Promise<void> {
    if (!job.competitorId || !ObjectId.isValid(job.competitorId)) {
        await finishJob(job._id, 'failed', 'Конкурент не найден', null);
        return;
    }
    const db = await getDB();
    const competitor = await db.collection(IP_COLLECTIONS.competitors).findOne({ _id: new ObjectId(job.competitorId) });
    if (!competitor) {
        await finishJob(job._id, 'failed', 'Конкурент не найден', null);
        return;
    }
    if (competitor.status !== 'approved') {
        await finishJob(job._id, 'failed', 'Снимать цены можно только у одобренных конкурентов', null);
        return;
    }

    const window = resolvePeriodWindow(periodOf(job.period));
    const result = await runMonitorForCompetitor({
        competitorId: String(competitor._id),
        roomId: competitor.roomId == null ? null : Number(competitor.roomId),
        cluster: competitor.cluster ? String(competitor.cluster) : null,
        platform: competitor.platform as CompetitorPlatform,
        url: String(competitor.url || ''),
        periodStart: window.startIso,
        periodEnd: window.endIso,
        userName: job.userName,
    });
    await finishJob(job._id, 'done', null, {
        costUsd: result.costUsd,
        warnings: result.warnings || [],
        done: 1,
        total: 1,
    });
    try {
        await writePricingJournal({
            userId: job.userId,
            userName: job.userName,
            type: 'apify съём',
            target: String(competitor.url || job.competitorId),
            detail: `снимков ${result.snapshots}, ${result.checkIn || '?'}→${result.checkOut || '?'} (7н), $${result.costUsd.toFixed(3)}${result.warnings?.length ? `; нет: ${result.warnings.join(', ')}` : ''}`,
        });
    } catch (error) {
        console.error('[scrape-queue] journal', error);
    }
}

async function runClusterJob(job: ScrapeJobDoc): Promise<void> {
    const cluster = String(job.cluster || '').trim();
    if (!cluster) {
        await finishJob(job._id, 'failed', 'Нужен cluster', null);
        return;
    }
    const db = await getDB();
    const rows = await db.collection(IP_COLLECTIONS.competitors).find({ cluster, status: 'approved' }).toArray();
    if (!rows.length) {
        await finishJob(job._id, 'failed', 'Нет одобренных конкурентов в кластере', null);
        return;
    }
    const window = resolvePeriodWindow(periodOf(job.period));
    const result = await runMonitorForCluster({
        cluster,
        competitors: rows.map((row) => ({
            _id: String(row._id),
            url: String(row.url || ''),
            platform: row.platform as CompetitorPlatform,
            name: row.name ? String(row.name) : undefined,
            roomId: row.roomId == null ? null : Number(row.roomId),
            cluster,
        })),
        periodStart: window.startIso,
        periodEnd: window.endIso,
        userName: job.userName,
    });
    await finishJob(job._id, 'done', null, {
        costUsd: result.costUsd,
        warnings: [],
        done: result.done,
        total: result.total,
    });
    try {
        await writePricingJournal({
            userId: job.userId,
            userName: job.userName,
            type: 'apify съём кластера',
            target: cluster,
            detail: `${result.done}/${result.total} · 7н · $${result.costUsd.toFixed(3)} · батч по площадкам`,
        });
    } catch (error) {
        console.error('[scrape-queue] journal', error);
    }
}

async function finishJob(
    id: ObjectId,
    status: 'done' | 'failed',
    error: string | null,
    result: ScrapeJobResult | null,
): Promise<void> {
    const col = await jobsCol();
    await col.updateOne(
        { _id: id, status: 'running' },
        {
            $set: { status, error, result, finishedAt: new Date(), heartbeatAt: new Date() },
            $unset: { activeKey: '' },
        },
    );
}

async function failQueuedJobs(message: string): Promise<void> {
    const col = await jobsCol();
    await col.updateMany(
        { status: 'queued' },
        { $set: { status: 'failed', error: message, finishedAt: new Date() }, $unset: { activeKey: '' } },
    );
}

export async function cancelQueuedScrapeJobs(reason: string): Promise<void> {
    const col = await jobsCol();
    await col.updateMany(
        { status: 'queued' },
        { $set: { status: 'cancelled', error: reason, finishedAt: new Date() }, $unset: { activeKey: '' } },
    );
}

async function insertJob(doc: Omit<ScrapeJobDoc, '_id'>): Promise<ScrapeJobView> {
    await ensureIndexes();
    const col = await jobsCol();
    try {
        const inserted = await col.insertOne(doc as ScrapeJobDoc);
        const saved = await col.findOne({ _id: inserted.insertedId });
        if (!saved) throw new Error('Не удалось поставить съём в очередь');
        kickScrapeQueue();
        return toView(saved);
    } catch (error) {
        if (!isDuplicate(error)) throw error;
        const existing =
            doc.kind === 'cluster'
                ? await col.findOne({ kind: 'cluster', cluster: doc.cluster, status: { $in: [...ACTIVE] } })
                : await col.findOne({
                      kind: 'competitor',
                      competitorId: doc.competitorId,
                      status: { $in: [...ACTIVE] },
                  });
        if (!existing) throw error;
        kickScrapeQueue();
        return toView(existing);
    }
}

export async function enqueueCompetitorScrape(params: {
    competitorId: string;
    cluster: string | null;
    period: PeriodId;
    userId: string;
    userName: string;
}): Promise<ScrapeJobView> {
    await ensureIndexes();
    const col = await jobsCol();
    if (params.cluster) {
        const clusterJob = await col.findOne({
            kind: 'cluster',
            cluster: params.cluster,
            status: { $in: [...ACTIVE] },
        });
        if (clusterJob) {
            kickScrapeQueue();
            return toView(clusterJob);
        }
    }
    const own = await col.findOne({
        kind: 'competitor',
        competitorId: params.competitorId,
        status: { $in: [...ACTIVE] },
    });
    if (own) {
        kickScrapeQueue();
        return toView(own);
    }

    const now = new Date();
    return insertJob({
        kind: 'competitor',
        status: 'queued',
        competitorId: params.competitorId,
        cluster: params.cluster,
        period: params.period,
        userId: params.userId,
        userName: params.userName,
        createdAt: now,
        startedAt: null,
        heartbeatAt: null,
        finishedAt: null,
        error: null,
        result: null,
        activeKey: `competitor:${params.competitorId}`,
    });
}

export async function enqueueClusterScrape(params: {
    cluster: string;
    period: PeriodId;
    userId: string;
    userName: string;
}): Promise<ScrapeJobView> {
    await ensureIndexes();
    const col = await jobsCol();
    const existing = await col.findOne({
        kind: 'cluster',
        cluster: params.cluster,
        status: { $in: [...ACTIVE] },
    });
    if (existing) {
        kickScrapeQueue();
        return toView(existing);
    }

    await col.updateMany(
        { kind: 'competitor', cluster: params.cluster, status: 'queued' },
        { $set: { status: 'cancelled', error: null, finishedAt: new Date() }, $unset: { activeKey: '' } },
    );

    const now = new Date();
    return insertJob({
        kind: 'cluster',
        status: 'queued',
        competitorId: null,
        cluster: params.cluster,
        period: params.period,
        userId: params.userId,
        userName: params.userName,
        createdAt: now,
        startedAt: null,
        heartbeatAt: null,
        finishedAt: null,
        error: null,
        result: null,
        activeKey: `cluster:${params.cluster}`,
    });
}

export async function readScrapeQueue(): Promise<{ active: ScrapeJobView[]; recent: ScrapeJobView[] }> {
    const col = await jobsCol();
    const since = new Date(Date.now() - 30 * 60 * 1000);
    const [activeDocs, recentDocs] = await Promise.all([
        col
            .find({ status: { $in: [...ACTIVE] } })
            .sort({ createdAt: 1 })
            .toArray(),
        col
            .find({ status: { $in: ['done', 'failed', 'cancelled'] }, finishedAt: { $gte: since } })
            .sort({ finishedAt: -1 })
            .limit(30)
            .toArray(),
    ]);

    const state = queueState();
    const needsWorker = activeDocs.some((doc) => doc.status === 'queued' || doc.status === 'running');
    if (needsWorker && !state.drain) kickScrapeQueue();

    return {
        active: activeDocs.map(toView),
        recent: recentDocs.map(toView),
    };
}

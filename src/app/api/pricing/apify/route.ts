import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { abortAllRunning, runMonitorForCluster, runMonitorForCompetitor } from '@/lib/pricing/apify/gateway';
import { MONITOR_STAY_NIGHTS, actorById, monitorActorFor } from '@/lib/pricing/apify/registry';
import { runClusterDiscoveryMix } from '@/lib/pricing/apify/discovery';
import { spentSince } from '@/lib/pricing/apify/budget';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { IP_COLLECTIONS } from '@/lib/pricing/collections';
import { writePricingJournal } from '@/lib/pricing/journal';
import { PERIOD_IDS, resolvePeriodWindow, type PeriodId } from '@/lib/pricing/periods';
import { ensurePricingSeeded, getApifyBudget } from '@/lib/pricing/seed';
import type { CompetitorPlatform } from '@/lib/pricing/types';
import { DEFAULT_APIFY_BUDGET } from '@/lib/pricing/types';

export async function GET() {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    await ensurePricingSeeded();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const settings = await getApifyBudget();
    const [daySpent, monthSpent, db] = await Promise.all([
        spentSince(dayStart, settings.budgetResetAt),
        spentSince(monthStart, settings.budgetResetAt),
        getDB(),
    ]);
    const runs = await db.collection(IP_COLLECTIONS.apifyRuns).find({}).sort({ startedAt: -1 }).limit(30).toArray();
    return NextResponse.json({
        success: true,
        data: {
            settings,
            tokenConfigured: Boolean(process.env.APIFY_TOKEN),
            daySpent,
            monthSpent,
            dayLimitPct: settings.perDayUsd ? daySpent / settings.perDayUsd : 0,
            monthLimitPct: settings.perMonthUsd ? monthSpent / settings.perMonthUsd : 0,
            actors: [
                'apify/rag-web-browser',
                'tri_angle/airbnb-rooms-urls-scraper',
                'voyager/booking-scraper',
                'bestscraper/agoda-property-scraper',
                'datawebot/trip-hotel-scraper',
            ]
                .map(actorById)
                .filter(Boolean),
            runs,
        },
    });
}

export async function POST(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();

    if (body.action === 'stop') {
        const n = await abortAllRunning();
        const db = await getDB();
        await db.collection(IP_COLLECTIONS.settings).updateOne(
            { _id: 'apify' as never },
            { $set: { scrapingEnabled: false } },
            { upsert: true },
        );
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName: access.user.name || access.user.login,
            type: 'apify стоп-кран',
            target: 'global',
            detail: `остановлено прогонов: ${n}`,
        });
        return NextResponse.json({ success: true, aborted: n });
    }

    if (body.action === 'enable') {
        const db = await getDB();
        await db.collection(IP_COLLECTIONS.settings).updateOne(
            { _id: 'apify' as never },
            { $set: { scrapingEnabled: true } },
            { upsert: true },
        );
        return NextResponse.json({ success: true });
    }

    if (body.action === 'resetLimits') {
        const db = await getDB();
        const now = new Date();
        await db.collection(IP_COLLECTIONS.settings).updateOne(
            { _id: 'apify' as never },
            {
                $set: {
                    perDayUsd: DEFAULT_APIFY_BUDGET.perDayUsd,
                    perMonthUsd: DEFAULT_APIFY_BUDGET.perMonthUsd,
                    budgetResetAt: now,
                },
            },
            { upsert: true },
        );
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName: access.user.name || access.user.login,
            type: 'apify сброс лимитов',
            target: 'global',
            detail: `$${DEFAULT_APIFY_BUDGET.perDayUsd}/день · $${DEFAULT_APIFY_BUDGET.perMonthUsd}/месяц, счётчики обнулены`,
        });
        return NextResponse.json({ success: true, data: { budgetResetAt: now.toISOString() } });
    }

    if (body.action === 'estimate') {
        const platform = String(body.platform || '') as CompetitorPlatform;
        const actor = monitorActorFor(platform);
        return NextResponse.json({
            success: true,
            data: {
                estimatedUsd: actor ? actor.estimatedUsd * MONITOR_STAY_NIGHTS.length : 0,
                actor: actor?.id,
                stays: [...MONITOR_STAY_NIGHTS],
            },
        });
    }

    if (body.action === 'discover') {
        const cluster = String(body.cluster || '').trim();
        if (!cluster) {
            return NextResponse.json({ success: false, message: 'Нужен cluster' }, { status: 400 });
        }
        try {
            const result = await runClusterDiscoveryMix({
                cluster,
                userName: access.user.name || access.user.login,
            });
            const mix = (result.byPlatform || [])
                .map((p) => `${p.platform} +${p.inserted}`)
                .join(', ');
            await writePricingJournal({
                userId: String(access.user._id || access.user.login),
                userName: access.user.name || access.user.login,
                type: 'discovery',
                target: cluster,
                detail: `${mix || 'пусто'}: +${result.inserted} кандидатов, $${result.costUsd.toFixed(3)}`,
            });
            return NextResponse.json({ success: true, data: result });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Ошибка Discovery';
            return NextResponse.json({ success: false, message }, { status: 400 });
        }
    }

    if (body.action === 'run') {
        const db = await getDB();
        const competitor = await db.collection(IP_COLLECTIONS.competitors).findOne({ _id: new ObjectId(String(body.competitorId)) });
        if (!competitor) {
            return NextResponse.json({ success: false, message: 'Конкурент не найден' }, { status: 404 });
        }
        if (competitor.status === 'blocked') {
            return NextResponse.json({ success: false, message: 'Ссылка заблокирована и не снимается' }, { status: 400 });
        }
        if (competitor.status !== 'approved') {
            return NextResponse.json(
                { success: false, message: 'Снимать цены можно только у одобренных конкурентов' },
                { status: 400 },
            );
        }
        const rawPeriod = String(body.period || '');
        const period = (PERIOD_IDS as readonly string[]).includes(rawPeriod) ? (rawPeriod as PeriodId) : 'P1';
        const window = resolvePeriodWindow(period);
        try {
            const result = await runMonitorForCompetitor({
                competitorId: String(competitor._id),
                roomId: competitor.roomId == null ? null : Number(competitor.roomId),
                cluster: competitor.cluster ? String(competitor.cluster) : null,
                platform: competitor.platform,
                url: competitor.url,
                periodStart: window.startIso,
                periodEnd: window.endIso,
                userName: access.user.name || access.user.login,
            });
            await writePricingJournal({
                userId: String(access.user._id || access.user.login),
                userName: access.user.name || access.user.login,
                type: 'apify съём',
                target: competitor.url,
                detail: `снимков ${result.snapshots}, ${result.checkIn || '?'}→${result.checkOut || '?'} (7н), $${result.costUsd.toFixed(3)}${result.warnings?.length ? `; нет: ${result.warnings.join(', ')}` : ''}`,
            });
            return NextResponse.json({ success: true, data: result });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Ошибка Apify';
            return NextResponse.json({ success: false, message }, { status: 400 });
        }
    }

    if (body.action === 'runCluster') {
        const cluster = String(body.cluster || '').trim();
        if (!cluster) {
            return NextResponse.json({ success: false, message: 'Нужен cluster' }, { status: 400 });
        }
        const db = await getDB();
        const rows = await db
            .collection(IP_COLLECTIONS.competitors)
            .find({ cluster, status: 'approved' })
            .toArray();
        if (!rows.length) {
            return NextResponse.json(
                { success: false, message: 'Нет одобренных конкурентов в кластере' },
                { status: 400 },
            );
        }
        const rawPeriod = String(body.period || '');
        const period = (PERIOD_IDS as readonly string[]).includes(rawPeriod) ? (rawPeriod as PeriodId) : 'P1';
        const window = resolvePeriodWindow(period);
        try {
            const result = await runMonitorForCluster({
                cluster,
                competitors: rows.map((r) => ({
                    _id: String(r._id),
                    url: String(r.url || ''),
                    platform: r.platform as CompetitorPlatform,
                    name: r.name ? String(r.name) : undefined,
                    roomId: r.roomId == null ? null : Number(r.roomId),
                    cluster,
                })),
                periodStart: window.startIso,
                periodEnd: window.endIso,
                userName: access.user.name || access.user.login,
            });
            await writePricingJournal({
                userId: String(access.user._id || access.user.login),
                userName: access.user.name || access.user.login,
                type: 'apify съём кластера',
                target: cluster,
                detail: `${result.done}/${result.total} · 7н · $${result.costUsd.toFixed(3)} · батч по площадкам`,
            });
            return NextResponse.json({ success: true, data: result });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Ошибка Apify';
            return NextResponse.json({ success: false, message }, { status: 400 });
        }
    }

    return NextResponse.json({ success: false, message: 'Неизвестное действие' }, { status: 400 });
}

export async function PUT(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    const set: Record<string, unknown> = {};
    if (typeof body.scrapingEnabled === 'boolean') set.scrapingEnabled = body.scrapingEnabled;
    for (const key of ['perRunUsd', 'perDayUsd', 'perMonthUsd', 'ttlHours', 'timeoutMs', 'maxItems', 'topNPerObject'] as const) {
        if (body[key] != null && Number.isFinite(Number(body[key]))) set[key] = Number(body[key]);
    }
    if (body.scrapePeriod != null) {
        const raw = String(body.scrapePeriod);
        set.scrapePeriod = (PERIOD_IDS as readonly string[]).includes(raw) ? raw : null;
    }
    if (!Object.keys(set).length) {
        return NextResponse.json({ success: false, message: 'Нет полей для обновления' }, { status: 400 });
    }
    const db = await getDB();
    await db.collection(IP_COLLECTIONS.settings).updateOne(
        { _id: 'apify' as never },
        { $set: set },
        { upsert: true },
    );
    return NextResponse.json({ success: true });
}

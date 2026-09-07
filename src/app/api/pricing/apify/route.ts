import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { abortAllRunning, runMonitorForCompetitor } from '@/lib/pricing/apify/gateway';
import { actorById, monitorActorFor } from '@/lib/pricing/apify/registry';
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
    const [settings, daySpent, monthSpent, db] = await Promise.all([
        getApifyBudget(),
        spentSince(dayStart),
        spentSince(monthStart),
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
            actors: ['tri_angle/airbnb-rooms-urls-scraper', 'voyager/booking-scraper', 'bestscraper/agoda-property-scraper', 'datawebot/trip-hotel-scraper']
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

    if (body.action === 'estimate') {
        const platform = String(body.platform || '') as CompetitorPlatform;
        const actor = monitorActorFor(platform);
        return NextResponse.json({
            success: true,
            data: {
                estimatedUsd: actor ? actor.estimatedUsd * 3 : 0,
                actor: actor?.id,
                dates: 3,
            },
        });
    }

    if (body.action === 'run') {
        const db = await getDB();
        const competitor = await db.collection(IP_COLLECTIONS.competitors).findOne({ _id: new ObjectId(String(body.competitorId)) });
        if (!competitor) {
            return NextResponse.json({ success: false, message: 'Конкурент не найден' }, { status: 404 });
        }
        const rawPeriod = String(body.period || '');
        const period = (PERIOD_IDS as readonly string[]).includes(rawPeriod) ? (rawPeriod as PeriodId) : 'P1';
        const window = resolvePeriodWindow(period);
        try {
            const result = await runMonitorForCompetitor({
                competitorId: String(competitor._id),
                roomId: Number(competitor.roomId),
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
                detail: `снимков ${result.snapshots}, $${result.costUsd.toFixed(3)}`,
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
    const db = await getDB();
    await db.collection(IP_COLLECTIONS.settings).updateOne(
        { _id: 'apify' as never },
        { $set: { ...DEFAULT_APIFY_BUDGET, ...body } },
        { upsert: true },
    );
    return NextResponse.json({ success: true });
}

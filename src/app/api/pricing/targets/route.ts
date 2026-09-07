import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { IP_COLLECTIONS } from '@/lib/pricing/collections';
import { writePricingJournal } from '@/lib/pricing/journal';
import { PERIOD_IDS } from '@/lib/pricing/periods';
import { ensurePricingSeeded, getGlobalTargets } from '@/lib/pricing/seed';

export async function GET() {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    await ensurePricingSeeded();
    const targets = await getGlobalTargets();
    return NextResponse.json({ success: true, data: { targets, periods: PERIOD_IDS } });
}

export async function PUT(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    const period = String(body.period || '');
    const occTargetPct = Number(body.occTargetPct);
    if (!period || Number.isNaN(occTargetPct)) {
        return NextResponse.json({ success: false, message: 'Нужны period и occTargetPct' }, { status: 400 });
    }
    const year = new Date().getFullYear();
    const db = await getDB();
    await db.collection(IP_COLLECTIONS.targets).updateOne(
        { level: 'global', key: 'portfolio', period, year },
        { $set: { level: 'global', key: 'portfolio', period, year, occTargetPct } },
        { upsert: true },
    );
    await writePricingJournal({
        userId: String(access.user._id || access.user.login),
        userName: access.user.name || access.user.login,
        type: 'цель загрузки',
        target: period,
        detail: `${occTargetPct}%`,
    });
    return NextResponse.json({ success: true });
}

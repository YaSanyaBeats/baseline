import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { IP_COLLECTIONS } from '@/lib/pricing/collections';
import { writePricingJournal } from '@/lib/pricing/journal';
import { PERIOD_IDS } from '@/lib/pricing/periods';
import { ensurePricingSeeded, getGlobalTargets, getParameters } from '@/lib/pricing/seed';

export async function GET() {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    await ensurePricingSeeded();
    const [parameters, targets] = await Promise.all([getParameters(), getGlobalTargets()]);
    const byPeriod = PERIOD_IDS.map((period) => {
        const cells = parameters.filter((p) => p.period === period);
        const rpi = cells[0]?.rpi ?? 0;
        const regime = cells[0]?.regime ?? 'LOW';
        const occNorm = cells.length ? cells.reduce((s, c) => s + c.occNorm, 0) / cells.length : 0;
        return { period, rpi, regime, occNorm, occTarget: targets[period] ?? occNorm, dates: cells[0]?.dates ?? '' };
    });
    return NextResponse.json({ success: true, data: { parameters, byPeriod, targets } });
}

export async function PUT(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    const db = await getDB();

    if (body.period && typeof body.rpi === 'number') {
        const rpi = Math.max(0, Math.min(1, Number(body.rpi)));
        await db.collection(IP_COLLECTIONS.parameters).updateMany({ period: body.period }, { $set: { rpi } });
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName: access.user.name || access.user.login,
            type: 'сезонный спрос',
            target: String(body.period),
            detail: `RPI → ${rpi.toFixed(2)}`,
        });
    }

    return NextResponse.json({ success: true });
}

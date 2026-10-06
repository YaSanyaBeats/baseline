import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { IP_COLLECTIONS } from '@/lib/pricing/collections';
import { writePricingJournal } from '@/lib/pricing/journal';
import { recordPriceChange } from '@/lib/pricing/priceChanges';

/**
 * Принятие рекомендации хранится только в Baseline.
 * Запись в Beds24 намеренно отключена и не вызывается.
 */
export async function POST(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    const roomId = body.roomId == null ? null : Number(body.roomId);
    const cluster = body.cluster ? String(body.cluster) : null;
    const period = String(body.period || '');
    const year = Number(body.year);
    const price = Number(body.price);
    if (!period || !price || (!roomId && !cluster)) {
        return NextResponse.json({ success: false, message: 'Нужны period, price и roomId или cluster' }, { status: 400 });
    }

    const db = await getDB();
    const doc = {
        roomId,
        cluster,
        period,
        year: Number.isFinite(year) ? year : undefined,
        price,
        reason: String(body.reason || ''),
        previousPrice: body.previousPrice ?? null,
        pushedToBeds24: false,
        userId: String(access.user._id || access.user.login),
        userName: access.user.name || access.user.login,
        createdAt: new Date(),
    };
    await db.collection(IP_COLLECTIONS.accepted).insertOne(doc);
    await writePricingJournal({
        userId: doc.userId,
        userName: doc.userName,
        type: 'принята рекомендация',
        target: roomId ? `#${roomId} · ${period}` : `${cluster} · ${period}`,
        detail: `${price} ฿. Запись в Beds24 отключена — цена сохранена только в Baseline.`,
        payload: { price, period, roomId, cluster, pushedToBeds24: false },
    });
    try {
        await recordPriceChange({
            roomId,
            cluster,
            period,
            year: Number.isFinite(year) ? year : new Date().getFullYear(),
            priceAfter: price,
            priceBefore: body.previousPrice == null ? null : Number(body.previousPrice),
            initiator: 'engine',
            userName: doc.userName,
            reason: doc.reason,
            rpi: body.rpi == null ? null : Number(body.rpi),
            regime: body.regime ? String(body.regime) : null,
            paceRatio: body.paceRatio == null ? null : Number(body.paceRatio),
            competitor: body.competitor == null ? null : Number(body.competitor),
            competitorCount: body.competitorCount == null ? null : Number(body.competitorCount),
            floored: Boolean(body.floored),
            daysToArrival: body.daysToArrival == null ? null : Number(body.daysToArrival),
            complete: body.rpi != null,
        });
    } catch (error) {
        console.error('recordPriceChange', error);
    }

    return NextResponse.json({
        success: true,
        data: { pushedToBeds24: false, stored: true },
        message: 'Рекомендация сохранена в Baseline. В Beds24 ничего не записано.',
    });
}

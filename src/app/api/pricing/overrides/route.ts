import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { IP_COLLECTIONS } from '@/lib/pricing/collections';
import { writePricingJournal } from '@/lib/pricing/journal';

export async function PUT(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    const roomId = Number(body.roomId);
    const period = String(body.period || '');
    const year = Number(body.year);
    const price = Number(body.price);
    if (!roomId || !period || !price) {
        return NextResponse.json({ success: false, message: 'Нужны roomId, period и цена' }, { status: 400 });
    }
    const db = await getDB();
    const yearFilter = Number.isFinite(year) ? year : undefined;
    await db.collection(IP_COLLECTIONS.overrides).updateOne(
        { roomId, period, ...(yearFilter != null ? { year: yearFilter } : {}) },
        {
            $set: {
                roomId,
                period,
                price,
                updatedAt: new Date(),
                userName: access.user.name || access.user.login,
                ...(yearFilter != null ? { year: yearFilter } : {}),
            },
        },
        { upsert: true },
    );
    await writePricingJournal({
        userId: String(access.user._id || access.user.login),
        userName: access.user.name || access.user.login,
        type: 'ручной оверрайд',
        target: `#${roomId} · ${period}`,
        detail: `цена ${price} ฿ (только в Baseline, Beds24 не меняется)`,
    });
    return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const { searchParams } = new URL(request.url);
    const roomId = Number(searchParams.get('roomId'));
    const period = searchParams.get('period') || '';
    const rawYear = Number(searchParams.get('year'));
    const db = await getDB();
    const filter: Record<string, unknown> = { roomId, period };
    if (Number.isFinite(rawYear) && rawYear >= 2000) filter.year = rawYear;
    await db.collection(IP_COLLECTIONS.overrides).deleteOne(filter);
    await writePricingJournal({
        userId: String(access.user._id || access.user.login),
        userName: access.user.name || access.user.login,
        type: 'сброс оверрайда',
        target: `#${roomId} · ${period}`,
        detail: 'возврат к рекомендации движка',
    });
    return NextResponse.json({ success: true });
}

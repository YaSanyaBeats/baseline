import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { IP_COLLECTIONS } from '@/lib/pricing/collections';
import { writePricingJournal } from '@/lib/pricing/journal';
import { DEFAULT_TEMPERATURE, type TemperatureSettings } from '@/lib/pricing/types';
import { ensurePricingSeeded, getChannels, getTemperature } from '@/lib/pricing/seed';

export async function GET() {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    await ensurePricingSeeded();
    const [temperature, channels] = await Promise.all([getTemperature(), getChannels()]);
    return NextResponse.json({ success: true, data: { temperature, channels } });
}

export async function PUT(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    const db = await getDB();

    if (body.temperature) {
        const next: TemperatureSettings = { ...DEFAULT_TEMPERATURE, ...body.temperature };
        await db.collection(IP_COLLECTIONS.settings).updateOne(
            { _id: 'temperature' as never },
            { $set: next },
            { upsert: true },
        );
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName: access.user.name || access.user.login,
            type: 'температура',
            target: 'модель',
            detail: `g=${next.g}, high=${next.rH}, shoulder=${next.rS}, low=${next.rL}, comp=${next.comp}`,
            payload: next as unknown as Record<string, unknown>,
        });
    }

    if (body.channels) {
        await db.collection(IP_COLLECTIONS.settings).updateOne(
            { _id: 'channels' as never },
            { $set: body.channels },
            { upsert: true },
        );
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName: access.user.name || access.user.login,
            type: 'каналы',
            target: 'справочник',
            detail: 'обновлены коэффициенты / лестницы скидок',
        });
    }

    return NextResponse.json({ success: true });
}

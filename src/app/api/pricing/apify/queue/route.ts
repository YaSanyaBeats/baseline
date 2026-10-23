import { NextResponse } from 'next/server';
import { readScrapeQueue } from '@/lib/pricing/apify/queue';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const data = await readScrapeQueue();
    return NextResponse.json({ success: true, data });
}

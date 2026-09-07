import { NextRequest, NextResponse } from 'next/server';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { listPricingJournal } from '@/lib/pricing/journal';

export async function GET(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const { searchParams } = new URL(request.url);
    const result = await listPricingJournal({
        type: searchParams.get('type') || undefined,
        userName: searchParams.get('userName') || undefined,
        limit: Number(searchParams.get('limit') || 100),
        skip: Number(searchParams.get('skip') || 0),
    });
    return NextResponse.json({ success: true, ...result });
}

import { NextRequest, NextResponse } from 'next/server';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { buildDesk } from '@/lib/pricing/desk';
import { PERIOD_IDS, defaultPeriodForToday, seasonYearForDate, type PeriodId } from '@/lib/pricing/periods';

export async function GET(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;

    const { searchParams } = new URL(request.url);
    const rawPeriod = searchParams.get('period') || defaultPeriodForToday();
    const period = (PERIOD_IDS as readonly string[]).includes(rawPeriod) ? (rawPeriod as PeriodId) : defaultPeriodForToday();
    const rawYear = Number(searchParams.get('year'));
    const year = Number.isFinite(rawYear) && rawYear >= 2000 && rawYear <= 2100 ? rawYear : seasonYearForDate();
    const days = searchParams.get('days');
    const useCompetitors = searchParams.get('comp') !== '0';
    const daysToArrival = days != null && days !== '' ? Number(days) : undefined;

    try {
        const data = await buildDesk(
            period,
            Number.isFinite(daysToArrival as number) ? daysToArrival : undefined,
            useCompetitors,
            year,
        );
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('GET /api/pricing/desk', error);
        return NextResponse.json({ success: false, message: 'Не удалось построить рабочий стол' }, { status: 500 });
    }
}

import { NextRequest } from 'next/server';
import { effectChartResponse } from '@/lib/pricing/effectHttp';

export async function GET(request: NextRequest) {
    return effectChartResponse(request);
}

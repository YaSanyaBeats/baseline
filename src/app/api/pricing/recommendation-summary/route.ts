import { NextRequest } from 'next/server';
import { recommendationSummaryResponse } from '@/lib/pricing/effectHttp';

export async function GET(request: NextRequest) {
    return recommendationSummaryResponse(request);
}

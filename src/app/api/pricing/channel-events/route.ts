import { NextRequest } from 'next/server';
import { channelEventResponse } from '@/lib/pricing/effectHttp';

export async function POST(request: NextRequest) {
    return channelEventResponse(request);
}

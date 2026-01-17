import { NextResponse } from 'next/server';

/**
 * Создаёт NextResponse с заголовками, отключающими кеширование
 */
export function createUncachedResponse(data: any, status: number = 200): NextResponse {
    return NextResponse.json(data, {
        status,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store',
        },
    });
}

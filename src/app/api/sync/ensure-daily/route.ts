import { NextResponse } from 'next/server';

/** Автосинхронизация с Beds24 отключена. Ручной запуск — со страницы Beds24. */
export async function GET() {
    return NextResponse.json({
        success: true,
        triggered: false,
        reason: 'disabled',
    });
}

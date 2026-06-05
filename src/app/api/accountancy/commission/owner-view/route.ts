import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { loadCommissionOwnerViewPayloadServer } from '@/lib/server/commissionOwnerViewServer';

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        const ownerId = request.nextUrl.searchParams.get('ownerId')?.trim() ?? '';
        const monthKey = request.nextUrl.searchParams.get('month')?.trim() ?? '';
        const locale = request.nextUrl.searchParams.get('locale')?.trim() ?? 'ru-RU';

        if (!ownerId || !monthKey) {
            return NextResponse.json(
                { success: false, message: 'ownerId и month обязательны' },
                { status: 400 }
            );
        }

        const payload = await loadCommissionOwnerViewPayloadServer(
            session,
            ownerId,
            monthKey,
            locale
        );

        if (!payload) {
            return NextResponse.json(
                { success: false, message: 'Не удалось сформировать отчёт' },
                { status: 404 }
            );
        }

        return NextResponse.json(payload);
    } catch (error) {
        console.error('Error in GET /api/accountancy/commission/owner-view:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUnprocessedBookingIds, getProcessedBookingIds } from '@/lib/autoAccountingEngine';

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const idsParam = searchParams.get('ids');

        if (idsParam) {
            const ids = idsParam
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => !Number.isNaN(n) && n > 0);
            const processedIds = await getProcessedBookingIds(ids);
            return NextResponse.json({
                success: true,
                processedBookingIds: processedIds,
            });
        }

        const ids = await getUnprocessedBookingIds();
        return NextResponse.json({
            success: true,
            unprocessedBookingCount: ids.length,
        });
    } catch (error) {
        console.error('Error in GET /api/autoAccounting/status:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

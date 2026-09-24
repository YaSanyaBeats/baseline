import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { runOwnerReportCheck } from '@/lib/server/ownerReportCheck';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        const role = (session?.user as { role?: string } | undefined)?.role;
        if (!session?.user || (role !== 'admin' && role !== 'accountant')) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        const result = await runOwnerReportCheck();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error('Error in POST /api/accountancy/commission/report-check:', error);
        return NextResponse.json(
            { success: false, message: 'Не удалось проверить отчёты' },
            { status: 500 }
        );
    }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { saveReportsForAllClosedPeriods } from '@/lib/server/ownerReportSnapshots';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
        }

        const user = session.user as { role?: string; _id?: string; name?: string };
        if (user.role !== 'admin' && user.role !== 'accountant') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Миграция доступна только админу и бухгалтеру.' },
                { status: 403 }
            );
        }

        const db = await getDB();
        const stats = await saveReportsForAllClosedPeriods(db, user._id?.toString?.() ?? user.name ?? '');
        const message =
            stats.rooms === 0
                ? 'Нет закрытых периодов'
                : `Готово. Месяцев: ${stats.months}, комнат: ${stats.rooms}. Новых снимков: ${stats.saved}, проверок обновлено: ${stats.rechecked}.`;

        return NextResponse.json({ success: true, message, stats });
    } catch (error) {
        console.error('migrate-closed-report-snapshots:', error);
        return NextResponse.json(
            { success: false, message: 'Не удалось сохранить отчёты закрытых периодов' },
            { status: 500 }
        );
    }
}

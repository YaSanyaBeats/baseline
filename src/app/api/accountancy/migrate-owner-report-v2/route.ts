import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { migrateOwnerReportSnapshotsToV2 } from '@/lib/server/ownerReportSnapshots';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
        }

        const user = session.user as { role?: string };
        if (user.role !== 'admin' && user.role !== 'accountant') {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Недостаточно прав. Миграция доступна только админу и бухгалтеру.',
                },
                { status: 403 }
            );
        }

        const db = await getDB();
        const stats = await migrateOwnerReportSnapshotsToV2(db);
        const message =
            stats.scanned === 0
                ? 'Нет сохранённых отчётов'
                : `Готово. Просмотрено: ${stats.scanned}, обновлено: ${stats.updated}, уже v2: ${stats.skipped}.`;

        return NextResponse.json({ success: true, message, stats });
    } catch (error) {
        console.error('migrate-owner-report-v2:', error);
        return NextResponse.json(
            { success: false, message: 'Не удалось мигрировать сохранённые отчёты на v2' },
            { status: 500 }
        );
    }
}

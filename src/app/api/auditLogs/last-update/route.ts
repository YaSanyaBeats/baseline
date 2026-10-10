import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Collection } from 'mongodb';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import type { AuditLogEntity } from '@/lib/types';

const ENTITIES = new Set<AuditLogEntity>(['expense', 'income']);

let indexReady: Promise<void> | null = null;

function ensureAuditLookupIndex(collection: Collection): Promise<void> {
    if (!indexReady) {
        indexReady = collection
            .createIndex(
                { entity: 1, entityId: 1, action: 1, timestamp: -1 },
                { name: 'auditLogs_entity_entityId_action_timestamp' },
            )
            .then(() => undefined)
            .catch((error: unknown) => {
                indexReady = null;
                console.error('auditLogs index:', error);
            });
    }
    return indexReady;
}

/**
 * GET /api/auditLogs/last-update?entity=expense|income&entityId=...
 * Последнее ручное изменение транзакции (без тел oldData/newData).
 */
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
                { success: false, message: 'Недостаточно прав для просмотра логов' },
                { status: 403 },
            );
        }

        const { searchParams } = new URL(request.url);
        const entity = searchParams.get('entity') ?? '';
        const entityId = (searchParams.get('entityId') ?? '').trim();
        if (!ENTITIES.has(entity as AuditLogEntity) || !/^[a-fA-F0-9]{24}$/.test(entityId)) {
            return NextResponse.json(
                { success: false, message: 'Некорректные параметры' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const auditLogsCollection = db.collection('auditLogs');
        await ensureAuditLookupIndex(auditLogsCollection);

        const log = await auditLogsCollection.findOne(
            { entity, entityId, action: 'update' },
            {
                projection: { userName: 1, timestamp: 1 },
                sort: { timestamp: -1 },
            },
        );

        return NextResponse.json({
            success: true,
            data: log
                ? {
                      userName: typeof log.userName === 'string' && log.userName.trim() ? log.userName : '—',
                      timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : String(log.timestamp ?? ''),
                  }
                : null,
        });
    } catch (error) {
        console.error('Error in GET /api/auditLogs/last-update:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

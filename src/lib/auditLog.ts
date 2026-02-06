import { getDB } from './db/getDB';
import { AuditLog, AuditLogAction, AuditLogEntity } from './types';

/**
 * Записывает изменение в лог аудита
 */
export async function logAuditAction(params: {
    entity: AuditLogEntity;
    entityId?: string;
    action: AuditLogAction;
    userId: string;
    userName: string;
    userRole: string;
    description: string;
    oldData?: any;
    newData?: any;
    metadata?: {
        objectId?: number;
        bookingId?: number;
        category?: string;
        amount?: number;
        ip?: string;
        userAgent?: string;
    };
}): Promise<void> {
    try {
        const db = await getDB();
        const auditLogsCollection = db.collection('auditLogs');

        const logEntry: AuditLog = {
            entity: params.entity,
            entityId: params.entityId,
            action: params.action,
            userId: params.userId,
            userName: params.userName,
            userRole: params.userRole,
            description: params.description,
            oldData: params.oldData,
            newData: params.newData,
            metadata: params.metadata,
            timestamp: new Date(),
        };

        await auditLogsCollection.insertOne(logEntry as any);
    } catch (error) {
        console.error('Error logging audit action:', error);
        // Не бросаем ошибку, чтобы не прерывать основной процесс
    }
}

/**
 * Получает логи с фильтрацией и сортировкой
 */
export async function getAuditLogs(params: {
    entity?: AuditLogEntity;
    action?: AuditLogAction;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    entityId?: string;
    limit?: number;
    skip?: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
}) {
    const db = await getDB();
    const auditLogsCollection = db.collection('auditLogs');

    // Строим фильтр
    const filter: any = {};
    
    if (params.entity) {
        filter.entity = params.entity;
    }
    
    if (params.action) {
        filter.action = params.action;
    }
    
    if (params.userId) {
        filter.userId = params.userId;
    }

    if (params.entityId) {
        filter.entityId = params.entityId;
    }
    
    if (params.startDate || params.endDate) {
        filter.timestamp = {};
        if (params.startDate) {
            filter.timestamp.$gte = params.startDate;
        }
        if (params.endDate) {
            filter.timestamp.$lte = params.endDate;
        }
    }

    // Строим сортировку
    const sortField = params.sortField || 'timestamp';
    const sortOrder: 1 | -1 = params.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

    // Выполняем запрос
    const limit = params.limit || 50;
    const skip = params.skip || 0;

    const logs = await auditLogsCollection
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();

    const total = await auditLogsCollection.countDocuments(filter);

    return {
        logs,
        total,
        limit,
        skip,
    };
}

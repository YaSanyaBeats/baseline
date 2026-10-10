import { getDB } from './db/getDB';
import { AuditLog, AuditLogAction, AuditLogEntity, AuditLogMetadata } from './types';

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSearchAmount(raw: string): number | null {
    const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
    if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    const amount = Math.abs(Number(cleaned));
    if (!Number.isFinite(amount)) return null;
    return Math.round(amount * 100) / 100;
}

function amountMatchClause(amount: number): Record<string, unknown> {
    const signed = [amount, -amount];
    const fields = ['metadata.amount', 'newData.amount', 'oldData.amount', 'newData.reportAmount', 'oldData.reportAmount'];
    const or: Record<string, unknown>[] = fields.map((field) => ({ [field]: { $in: signed } }));
    for (const prefix of ['newData', 'oldData']) {
        or.push({
            $expr: {
                $eq: [
                    {
                        $round: [
                            {
                                $abs: {
                                    $multiply: [
                                        { $ifNull: [`$${prefix}.quantity`, 1] },
                                        { $convert: { input: `$${prefix}.amount`, to: 'double', onError: 0, onNull: 0 } },
                                    ],
                                },
                            },
                            2,
                        ],
                    },
                    amount,
                ],
            },
        });
    }
    const token = String(amount);
    const tokenComma = token.replace('.', ',');
    const pattern = `(^|[^\\d])(${escapeRegex(token)}|${escapeRegex(tokenComma)})([^\\d]|$)`;
    or.push({ description: { $regex: pattern } });
    return { $or: or };
}

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
    metadata?: AuditLogMetadata;
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
    /** Часть имени автора */
    author?: string;
    /** Сумма транзакции: поле amount, количество × цена или текст «сумма …» */
    amount?: string;
    /** Часть названия категории */
    category?: string;
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

    const and: Record<string, unknown>[] = [];
    const author = params.author?.trim();
    if (author) {
        and.push({ userName: { $regex: escapeRegex(author), $options: 'i' } });
    }
    const category = params.category?.trim();
    if (category) {
        const categoryRegex = { $regex: escapeRegex(category), $options: 'i' };
        and.push({
            $or: [
                { 'metadata.category': categoryRegex },
                { 'newData.category': categoryRegex },
                { 'oldData.category': categoryRegex },
                { description: categoryRegex },
            ],
        });
    }
    const amount = params.amount?.trim() ? parseSearchAmount(params.amount) : null;
    if (params.amount?.trim() && amount == null) {
        return { logs: [], total: 0, limit: params.limit || 50, skip: params.skip || 0 };
    }
    if (amount != null) {
        and.push(amountMatchClause(amount));
    }
    if (and.length > 0) {
        filter.$and = and;
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

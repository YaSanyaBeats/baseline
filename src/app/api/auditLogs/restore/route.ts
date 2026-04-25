import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';
import { AuditLogEntity } from '@/lib/types';

function collectionForDeletedEntity(
    entity: AuditLogEntity,
    description: string,
): string | null {
    switch (entity) {
        case 'expense':
            return 'expenses';
        case 'income':
            return 'incomes';
        case 'report':
            return 'reports';
        case 'user':
            return 'users';
        case 'category':
            return 'accountancyCategories';
        case 'cashflow':
            return 'cashflows';
        case 'booking':
            return null;
        case 'other': {
            if (description.startsWith('Удалён контрагент')) return 'counterparties';
            if (description.startsWith('Удалено правило кэшфлоу')) return 'cashflowRules';
            return null;
        }
        default:
            return null;
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as any).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const auditLogId = typeof body?.auditLogId === 'string' ? body.auditLogId : '';
        if (!auditLogId) {
            return NextResponse.json(
                { success: false, message: 'Не указан ID записи журнала' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const auditLogsCollection = db.collection('auditLogs');

        let log: Record<string, unknown> | null = null;
        try {
            log = await auditLogsCollection.findOne({ _id: new ObjectId(auditLogId) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID записи журнала' },
                { status: 400 },
            );
        }

        if (!log) {
            return NextResponse.json(
                { success: false, message: 'Запись журнала не найдена' },
                { status: 404 },
            );
        }

        if (log.action !== 'delete') {
            return NextResponse.json(
                { success: false, message: 'Восстановление доступно только для удалённых записей' },
                { status: 400 },
            );
        }

        if (log.restoredAt != null) {
            return NextResponse.json(
                { success: false, message: 'Эта запись журнала уже была восстановлена' },
                { status: 400 },
            );
        }

        const oldData = log.oldData as Record<string, unknown> | undefined;
        if (!oldData || typeof oldData !== 'object') {
            return NextResponse.json(
                { success: false, message: 'Нет сохранённых данных для восстановления' },
                { status: 400 },
            );
        }

        const entityId = typeof log.entityId === 'string' ? log.entityId : '';
        if (!entityId) {
            return NextResponse.json(
                { success: false, message: 'В записи журнала отсутствует ID сущности' },
                { status: 400 },
            );
        }

        const entity = log.entity as AuditLogEntity;
        const description = typeof log.description === 'string' ? log.description : '';
        const collectionName = collectionForDeletedEntity(entity, description);
        if (!collectionName) {
            return NextResponse.json(
                { success: false, message: 'Восстановление этого типа записей не поддерживается' },
                { status: 400 },
            );
        }

        const target = db.collection(collectionName);
        const _id = new ObjectId(entityId);
        const existing = await target.findOne({ _id });
        if (existing) {
            await auditLogsCollection.updateOne(
                { _id: new ObjectId(auditLogId) },
                { $set: { restoredAt: new Date() } },
            );
            return NextResponse.json(
                { success: false, message: 'Запись с таким ID уже существует' },
                { status: 409 },
            );
        }

        const doc = { ...oldData, _id };
        await target.insertOne(doc as any);

        await auditLogsCollection.updateOne(
            { _id: new ObjectId(auditLogId) },
            { $set: { restoredAt: new Date() } },
        );

        return NextResponse.json({
            success: true,
            message: 'Запись восстановлена',
        });
    } catch (error) {
        console.error('Error in POST /api/auditLogs/restore:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

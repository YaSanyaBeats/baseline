import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAuditLogs } from '@/lib/auditLog';
import { AuditLogAction, AuditLogEntity } from '@/lib/types';

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as any).role;
        // Только admin и accountant могут просматривать логи
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав для просмотра логов' },
                { status: 403 },
            );
        }

        const { searchParams } = new URL(request.url);
        
        // Получаем параметры фильтрации
        const entity = searchParams.get('entity') as AuditLogEntity | null;
        const action = searchParams.get('action') as AuditLogAction | null;
        const userId = searchParams.get('userId') || undefined;
        const entityId = searchParams.get('entityId') || undefined;
        const startDateStr = searchParams.get('startDate');
        const endDateStr = searchParams.get('endDate');
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const skip = parseInt(searchParams.get('skip') || '0', 10);
        const sortField = searchParams.get('sortField') || 'timestamp';
        const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

        // Преобразуем даты
        const startDate = startDateStr ? new Date(startDateStr) : undefined;
        const endDate = endDateStr ? new Date(endDateStr) : undefined;

        // Получаем логи с фильтрацией
        const result = await getAuditLogs({
            entity: entity || undefined,
            action: action || undefined,
            userId,
            entityId,
            startDate,
            endDate,
            limit,
            skip,
            sortField,
            sortOrder,
        });

        return NextResponse.json({
            success: true,
            data: result.logs,
            total: result.total,
            limit: result.limit,
            skip: result.skip,
        });
    } catch (error) {
        console.error('Error in GET /api/auditLogs:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

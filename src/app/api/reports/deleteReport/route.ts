import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';

export async function DELETE(request: NextRequest) {
    try {
        // Проверка аутентификации
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        // Проверка роли: только бухгалтер или администратор
        const userRole = (session.user as any).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Только бухгалтер или администратор могут удалять отчёты.' },
                { status: 403 }
            );
        }

        const db = await getDB();
        const reportsCollection = db.collection('reports');
        
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');
        
        if (!id) {
            return NextResponse.json({
                success: false,
                message: 'ID отчёта не указан'
            }, { status: 400 });
        }

        // Проверяем существование отчёта
        let existingReport;
        try {
            existingReport = await reportsCollection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID отчёта' },
                { status: 400 }
            );
        }
        if (!existingReport) {
            return NextResponse.json(
                { success: false, message: 'Отчёт не найден' },
                { status: 404 }
            );
        }
        
        await reportsCollection.deleteOne({
            _id: new ObjectId(id)
        });

        // Логируем удаление отчёта
        const userId = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'report',
            entityId: id,
            action: 'delete',
            userId,
            userName,
            userRole,
            description: `Удалён отчёт за ${existingReport.reportMonth}/${existingReport.reportYear} для объекта ${existingReport.objectId}`,
            oldData: existingReport,
            metadata: {
                objectId: existingReport.objectId,
            },
        });
        
        return NextResponse.json({
            success: true,
            message: 'Отчёт успешно удалён'
        });
    } catch (error) {
        console.error('Error in DELETE /api/reports/deleteReport:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { Report } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';

export async function POST(request: NextRequest) {
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
                { success: false, message: 'Недостаточно прав. Только бухгалтер или администратор могут редактировать отчёты.' },
                { status: 403 }
            );
        }

        const db = await getDB();
        const body = await request.json();
        const reportData: Report = body.params?.report || body.report;

        // Валидация данных
        if (!reportData._id || !reportData.reportLink || !reportData.reportMonth || !reportData.reportYear || !reportData.objectId) {
            return NextResponse.json(
                { success: false, message: 'Не все обязательные поля заполнены' },
                { status: 400 }
            );
        }

        // Проверка валидности месяца (1-12)
        if (reportData.reportMonth < 1 || reportData.reportMonth > 12) {
            return NextResponse.json(
                { success: false, message: 'Месяц должен быть от 1 до 12' },
                { status: 400 }
            );
        }

        // Проверка валидности года
        const currentYear = new Date().getFullYear();
        if (reportData.reportYear < 2000 || reportData.reportYear > currentYear + 1) {
            return NextResponse.json(
                { success: false, message: 'Некорректный год' },
                { status: 400 }
            );
        }

        // Проверка валидности URL
        try {
            new URL(reportData.reportLink);
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректная ссылка на отчёт' },
                { status: 400 }
            );
        }

        // Проверяем существование отчёта
        const reportsCollection = db.collection('reports');
        let existingReport;
        try {
            existingReport = await reportsCollection.findOne({ _id: new ObjectId(reportData._id) });
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

        // Обновляем отчёт
        const updateData: any = {
            reportLink: reportData.reportLink,
            reportMonth: reportData.reportMonth,
            reportYear: reportData.reportYear,
            objectId: reportData.objectId,
            roomIds: reportData.roomIds || []
        };

        await reportsCollection.updateOne(
            { _id: new ObjectId(reportData._id) },
            { $set: updateData }
        );

        // Логируем обновление отчёта
        const userId = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'report',
            entityId: reportData._id,
            action: 'update',
            userId,
            userName,
            userRole,
            description: `Обновлён отчёт за ${reportData.reportMonth}/${reportData.reportYear} для объекта ${reportData.objectId}`,
            oldData: existingReport,
            newData: updateData,
            metadata: {
                objectId: reportData.objectId,
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Отчёт успешно обновлён'
        });
    } catch (error) {
        console.error('Error in POST /api/reports/editReport:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

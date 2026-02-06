import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { Report } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';

export async function GET(request: NextRequest) {
    try {
        // Проверка аутентификации
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        const db = await getDB();
        const reportsCollection = db.collection('reports');
        const searchParams = request.nextUrl.searchParams;
        
        // Если есть параметры поиска, ищем конкретный отчёт
        const objectId = searchParams.get('objectId');
        const month = searchParams.get('month');
        const year = searchParams.get('year');
        
        if (objectId && month && year) {
            const report = await reportsCollection.findOne({
                objectId: Number(objectId),
                reportMonth: Number(month),
                reportYear: Number(year)
            });
            
            return NextResponse.json(report || null);
        }
        
        // Получаем все отчёты, отсортированные по дате создания (новые сначала)
        const reports = await reportsCollection
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json(reports);
    } catch (error) {
        console.error('Error in GET /api/reports:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

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
                { success: false, message: 'Недостаточно прав. Только бухгалтер или администратор могут добавлять отчёты.' },
                { status: 403 }
            );
        }

        const db = await getDB();
        const body = await request.json();
        const reportData: Report = body.params?.report || body.report;

        // Валидация данных
        if (!reportData.reportLink || !reportData.reportMonth || !reportData.reportYear || !reportData.objectId) {
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

        // Получаем информацию о бухгалтере (текущий пользователь)
        const usersCollection = db.collection('users');
        const accountantId = (session.user as any)._id;
        let accountant;
        try {
            accountant = await usersCollection.findOne({ _id: new ObjectId(accountantId) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID бухгалтера' },
                { status: 400 }
            );
        }
        if (!accountant) {
            return NextResponse.json(
                { success: false, message: 'Пользователь-бухгалтер не найден' },
                { status: 404 }
            );
        }

        // Создаём запись отчёта
        const reportsCollection = db.collection('reports');
        const newReport = {
            reportLink: reportData.reportLink,
            reportMonth: reportData.reportMonth,
            reportYear: reportData.reportYear,
            objectId: reportData.objectId,
            roomIds: reportData.roomIds || [],
            accountantId: accountantId,
            accountantName: accountant.name,
            createdAt: new Date()
        };

        const result = await reportsCollection.insertOne(newReport as any);

        // Логируем создание отчёта
        await logAuditAction({
            entity: 'report',
            entityId: result.insertedId.toString(),
            action: 'create',
            userId: accountantId,
            userName: accountant.name,
            userRole,
            description: `Создан отчёт за ${reportData.reportMonth}/${reportData.reportYear} для объекта ${reportData.objectId}`,
            newData: newReport,
            metadata: {
                objectId: reportData.objectId,
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Отчёт успешно добавлен'
        });
    } catch (error) {
        console.error('Error in POST /api/reports:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

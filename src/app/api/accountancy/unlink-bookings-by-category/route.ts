import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { AccountancyCategoryType } from '@/lib/types';
import { logAuditAction } from '@/lib/auditLog';

/**
 * Обнуляет bookingId у всех расходов или доходов с указанной категорией (остальные поля не трогаются).
 * Доступ: админ и бухгалтер.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'admin' && userRole !== 'accountant') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const recordType = body.recordType as AccountancyCategoryType | undefined;
        const categoryRaw = body.category;
        const category = typeof categoryRaw === 'string' ? categoryRaw.trim() : '';

        if (recordType !== 'expense' && recordType !== 'income') {
            return NextResponse.json(
                { success: false, message: 'Укажите тип транзакции: расход или доход' },
                { status: 400 },
            );
        }

        if (!category) {
            return NextResponse.json(
                { success: false, message: 'Укажите категорию' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const categoriesCollection = db.collection('accountancyCategories');
        const categoryDoc = await categoriesCollection.findOne({ type: recordType, name: category });
        if (!categoryDoc) {
            return NextResponse.json(
                { success: false, message: 'Категория не найдена для выбранного типа' },
                { status: 400 },
            );
        }

        const collectionName = recordType === 'expense' ? 'expenses' : 'incomes';
        const coll = db.collection(collectionName);

        const result = await coll.updateMany({ category }, { $set: { bookingId: null } });

        const su = session.user as { _id?: unknown; name?: unknown };
        const rawId = su._id;
        const userId =
            typeof rawId === 'string' ? rawId : typeof rawId === 'object' && rawId != null && 'toString' in rawId ? String((rawId as { toString(): string }).toString()) : '';
        const rawName = su.name ?? session.user.name;
        const userName = typeof rawName === 'string' ? rawName : 'Unknown';

        await logAuditAction({
            entity: 'other',
            action: 'update',
            userId,
            userName,
            userRole: userRole ?? '',
            description: `Снята привязка к броням по категории «${category}» (${recordType === 'expense' ? 'расходы' : 'доходы'}): обновлено записей ${result.modifiedCount}`,
            metadata: { category },
        });

        return NextResponse.json({
            success: true,
            message: `Обновлено записей: ${result.modifiedCount}`,
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount,
        });
    } catch (error) {
        console.error('unlink-bookings-by-category:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

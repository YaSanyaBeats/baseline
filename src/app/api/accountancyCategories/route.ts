import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import {
    AccountancyCategory,
    AccountancyCategoryType,
    CategoryDivisibility,
    CategoryCheckInOut,
} from '@/lib/types';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';

type AccountancyCategoryDb = Omit<AccountancyCategory, '_id'> & { _id?: ObjectId };

export async function GET(request: NextRequest) {
    try {
        const db = await getDB();
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get('type') as AccountancyCategoryType | null;

        const collection = db.collection<AccountancyCategoryDb>('accountancyCategories');

        const filter: Record<string, unknown> = {};
        if (type === 'expense' || type === 'income') {
            filter.type = type;
        }

        const categories = await collection
            .find(filter)
            .sort({ parentId: 1, order: 1, name: 1 })
            .toArray();

        return NextResponse.json(categories);
    } catch (error) {
        console.error('Error in GET /api/accountancyCategories:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 },
        );
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
        const name: string = body.name;
        const type: AccountancyCategoryType = body.type;
        const parentId: string | null = body.parentId ?? null;

        if (!name || typeof name !== 'string' || !name.trim()) {
            return NextResponse.json(
                { success: false, message: 'Название категории не может быть пустым' },
                { status: 400 },
            );
        }

        if (type !== 'expense' && type !== 'income') {
            return NextResponse.json(
                { success: false, message: 'Некорректный тип категории' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<AccountancyCategoryDb>('accountancyCategories');

        if (parentId) {
            const parent = await collection.findOne({ _id: new ObjectId(parentId), type });
            if (!parent) {
                return NextResponse.json(
                    { success: false, message: 'Родительская категория не найдена' },
                    { status: 400 },
                );
            }
        }

        const existing = await collection.findOne({
            name: name.trim(),
            type,
            parentId: parentId || null,
        });

        if (existing) {
            return NextResponse.json(
                { success: false, message: 'Такая категория уже существует' },
                { status: 400 },
            );
        }

        const maxOrder = await collection
            .find({ type, parentId: parentId || null })
            .sort({ order: -1 })
            .limit(1)
            .toArray();
        const order = (maxOrder[0]?.order ?? -1) + 1;

        const result = await collection.insertOne({
            name: name.trim(),
            type,
            parentId: parentId || null,
            order,
            createdAt: new Date(),
        });

        // Логируем создание категории
        const userId = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'category',
            entityId: result.insertedId.toString(),
            action: 'create',
            userId,
            userName,
            userRole,
            description: `Создана категория: ${name.trim()} (тип: ${type})`,
            newData: { name: name.trim(), type },
            metadata: { category: name.trim() },
        });

        return NextResponse.json({
            success: true,
            message: 'Категория успешно добавлена',
        });
    } catch (error) {
        console.error('Error in POST /api/accountancyCategories:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 },
        );
    }
}

export async function PUT(request: NextRequest) {
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
        const reorder: Array<{ id: string; parentId: string | null; order: number }> | undefined = body.reorder;

        if (reorder && Array.isArray(reorder) && reorder.length > 0) {
            const db = await getDB();
            const collection = db.collection<AccountancyCategoryDb>('accountancyCategories');
            for (const item of reorder) {
                try {
                    await collection.updateOne(
                        { _id: new ObjectId(item.id) },
                        { $set: { parentId: item.parentId || null, order: item.order } },
                    );
                } catch {
                    // skip invalid ids
                }
            }
            return NextResponse.json({
                success: true,
                message: 'Порядок категорий обновлён',
            });
        }

        const id: string = body._id;
        const name: string = body.name;
        const parentId: string | null = (body.parentId == null || body.parentId === '') ? null : body.parentId;
        const order: number | undefined = typeof body.order === 'number' ? body.order : undefined;
        const unit: string | undefined = body.unit;
        const divisibility: CategoryDivisibility | undefined =
            ['/2', '/3', 'неделимый'].includes(body.divisibility) ? body.divisibility : undefined;
        const pricePerUnit: number | undefined = typeof body.pricePerUnit === 'number' ? body.pricePerUnit : undefined;
        const attributionDate: string | undefined = body.attributionDate;
        const isAuto: boolean | undefined = typeof body.isAuto === 'boolean' ? body.isAuto : undefined;
        const checkInOut: CategoryCheckInOut | undefined =
            body.checkInOut === 'checkin' || body.checkInOut === 'checkout' ? body.checkInOut : undefined;
        const reportingPeriod: string | undefined = body.reportingPeriod;

        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID категории не указан' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<AccountancyCategoryDb>('accountancyCategories');

        let existing: AccountancyCategoryDb | null = null;
        try {
            existing = await collection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID категории' },
                { status: 400 },
            );
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Категория не найдена' },
                { status: 404 },
            );
        }

        const updateData: Partial<AccountancyCategoryDb> = {};
        if (typeof name === 'string' && name.trim()) {
            const duplicate = await collection.findOne({
                _id: { $ne: existing._id },
                name: name.trim(),
                type: existing.type,
                parentId: parentId ?? existing.parentId ?? null,
            });
            if (duplicate) {
                return NextResponse.json(
                    { success: false, message: 'Такая категория уже существует' },
                    { status: 400 },
                );
            }
            updateData.name = name.trim();
        }
        if (parentId !== undefined) updateData.parentId = parentId || null;
        if (order !== undefined) updateData.order = order;
        if (unit !== undefined) updateData.unit = unit;
        if (divisibility !== undefined) updateData.divisibility = divisibility;
        if (pricePerUnit !== undefined) updateData.pricePerUnit = pricePerUnit;
        if (attributionDate !== undefined) updateData.attributionDate = attributionDate;
        if (isAuto !== undefined) updateData.isAuto = isAuto;
        if (checkInOut !== undefined) updateData.checkInOut = checkInOut;
        if (reportingPeriod !== undefined) updateData.reportingPeriod = reportingPeriod;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({
                success: true,
                message: 'Категория без изменений',
            });
        }

        await collection.updateOne(
            { _id: existing._id },
            { $set: updateData },
        );

        const userId = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'category',
            entityId: id,
            action: 'update',
            userId,
            userName,
            userRole,
            description: `Обновлена категория: ${existing.name}`,
            oldData: existing,
            newData: updateData,
            metadata: { category: updateData.name ?? existing.name },
        });

        return NextResponse.json({
            success: true,
            message: 'Категория успешно обновлена',
        });
    } catch (error) {
        console.error('Error in PUT /api/accountancyCategories:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
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

        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID категории не указан' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<AccountancyCategoryDb>('accountancyCategories');

        let existing: AccountancyCategoryDb | null = null;
        try {
            existing = await collection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID категории' },
                { status: 400 },
            );
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Категория не найдена' },
                { status: 404 },
            );
        }

        await collection.deleteOne({ _id: existing._id });

        // Логируем удаление категории
        const userId = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'category',
            entityId: id,
            action: 'delete',
            userId,
            userName,
            userRole,
            description: `Удалена категория: ${existing.name} (тип: ${existing.type})`,
            oldData: existing,
            metadata: { category: existing.name },
        });

        return NextResponse.json({
            success: true,
            message: 'Категория успешно удалена',
        });
    } catch (error) {
        console.error('Error in DELETE /api/accountancyCategories:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 },
        );
    }
}



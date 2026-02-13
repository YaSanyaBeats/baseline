import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { Counterparty } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';

type CounterpartyDb = Omit<Counterparty, '_id'> & { _id?: ObjectId };

export async function GET() {
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

        const db = await getDB();
        const collection = db.collection<CounterpartyDb>('counterparties');

        const counterparties = await collection
            .find({})
            .sort({ name: 1 })
            .toArray();

        return NextResponse.json(counterparties);
    } catch (error) {
        console.error('Error in GET /api/counterparties:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
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
        const name: string = body.name?.trim();
        const roomLinks = Array.isArray(body.roomLinks) ? body.roomLinks : [];
        const comment: string = body.comment?.trim() || '';

        if (!name) {
            return NextResponse.json(
                { success: false, message: 'Имя контрагента не может быть пустым' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<CounterpartyDb>('counterparties');

        const existing = await collection.findOne({ name });
        if (existing) {
            return NextResponse.json(
                { success: false, message: 'Контрагент с таким именем уже существует' },
                { status: 400 },
            );
        }

        const counterpartyToInsert = {
            name,
            roomLinks: roomLinks.filter(
                (r: { id?: number; rooms?: number[] }) =>
                    typeof r?.id === 'number' && Array.isArray(r?.rooms)
            ),
            comment: comment || '',
            createdAt: new Date(),
        };

        const result = await collection.insertOne(counterpartyToInsert as any);

        const userId = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'other',
            entityId: result.insertedId.toString(),
            action: 'create',
            userId,
            userName,
            userRole,
            description: `Создан контрагент: ${name}`,
            newData: counterpartyToInsert,
            metadata: {},
        });

        return NextResponse.json({
            success: true,
            message: 'Контрагент успешно добавлен',
        });
    } catch (error) {
        console.error('Error in POST /api/counterparties:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
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
        const id: string = body._id;
        const name: string = body.name?.trim();
        const roomLinks = Array.isArray(body.roomLinks) ? body.roomLinks : [];
        const comment: string = body.comment?.trim() ?? '';

        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID контрагента не указан' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<CounterpartyDb>('counterparties');

        let existing: CounterpartyDb | null = null;
        try {
            existing = await collection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID контрагента' },
                { status: 400 },
            );
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Контрагент не найден' },
                { status: 404 },
            );
        }

        const updateData: Partial<CounterpartyDb> = {};
        if (typeof name === 'string' && name) {
            const duplicate = await collection.findOne({
                _id: { $ne: existing._id },
                name,
            });
            if (duplicate) {
                return NextResponse.json(
                    { success: false, message: 'Контрагент с таким именем уже существует' },
                    { status: 400 },
                );
            }
            updateData.name = name;
        }
        updateData.roomLinks = roomLinks.filter(
            (r: { id?: number; rooms?: number[] }) =>
                typeof r?.id === 'number' && Array.isArray(r?.rooms)
        );
        updateData.comment = comment || '';

        await collection.updateOne(
            { _id: existing._id },
            { $set: updateData },
        );

        const userId = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'other',
            entityId: id,
            action: 'update',
            userId,
            userName,
            userRole,
            description: `Обновлён контрагент: ${existing.name}`,
            oldData: existing,
            newData: updateData,
            metadata: {},
        });

        return NextResponse.json({
            success: true,
            message: 'Контрагент успешно обновлён',
        });
    } catch (error) {
        console.error('Error in PUT /api/counterparties:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
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
                { success: false, message: 'ID контрагента не указан' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<CounterpartyDb>('counterparties');

        let existing: CounterpartyDb | null = null;
        try {
            existing = await collection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID контрагента' },
                { status: 400 },
            );
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Контрагент не найден' },
                { status: 404 },
            );
        }

        await collection.deleteOne({ _id: existing._id });

        const userId = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'other',
            entityId: id,
            action: 'delete',
            userId,
            userName,
            userRole,
            description: `Удалён контрагент: ${existing.name}`,
            oldData: existing,
            metadata: {},
        });

        return NextResponse.json({
            success: true,
            message: 'Контрагент успешно удалён',
        });
    } catch (error) {
        console.error('Error in DELETE /api/counterparties:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

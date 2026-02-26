import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { Cashflow, CashflowType } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';

type CashflowDb = Omit<Cashflow, '_id'> & { _id?: ObjectId };

function parseRoomLinks(body: unknown): { id: number; rooms: number[] }[] {
    const arr = Array.isArray(body) ? body : [];
    return arr.filter(
        (r: { id?: number; rooms?: number[] }) =>
            typeof r?.id === 'number' && Array.isArray(r?.rooms)
    ) as { id: number; rooms: number[] }[];
}

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
        const collection = db.collection<CashflowDb>('cashflows');

        const cashflows = await collection
            .find({})
            .sort({ type: 1, name: 1 })
            .toArray();

        return NextResponse.json(cashflows);
    } catch (error) {
        console.error('Error in GET /api/cashflows:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

const VALID_TYPES: CashflowType[] = ['company', 'employee', 'room', 'object', 'premium', 'other'];

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
        const name: string = body.name?.trim() ?? '';
        const type: string = body.type ?? 'other';
        const roomLinks = parseRoomLinks(body.roomLinks);
        const userId: string | undefined = typeof body.userId === 'string' ? body.userId.trim() || undefined : undefined;
        const counterpartyIds: string[] = Array.isArray(body.counterpartyIds)
            ? body.counterpartyIds.filter((id: unknown) => typeof id === 'string' && id.trim())
            : [];
        const comment: string = body.comment?.trim() ?? '';

        if (!name) {
            return NextResponse.json(
                { success: false, message: 'Название кэшфлоу не может быть пустым' },
                { status: 400 },
            );
        }

        if (!VALID_TYPES.includes(type as CashflowType)) {
            return NextResponse.json(
                { success: false, message: 'Некорректный тип кэшфлоу' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<CashflowDb>('cashflows');

        const existing = await collection.findOne({ name });
        if (existing) {
            return NextResponse.json(
                { success: false, message: 'Кэшфлоу с таким названием уже существует' },
                { status: 400 },
            );
        }

        const cashflowToInsert: CashflowDb = {
            name,
            type: type as CashflowType,
            roomLinks,
            ...(userId && { userId }),
            counterpartyIds: counterpartyIds.length ? counterpartyIds : [],
            comment: comment || '',
            createdAt: new Date(),
        };

        const result = await collection.insertOne(cashflowToInsert as any);

        const uid = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'cashflow',
            entityId: result.insertedId.toString(),
            action: 'create',
            userId: uid,
            userName,
            userRole,
            description: `Создан кэшфлоу: ${name}`,
            newData: cashflowToInsert,
            metadata: {},
        });

        return NextResponse.json({
            success: true,
            message: 'Кэшфлоу успешно создан',
        });
    } catch (error) {
        console.error('Error in POST /api/cashflows:', error);
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
        const name: string = body.name?.trim() ?? '';
        const type: string = body.type ?? 'other';
        const roomLinks = parseRoomLinks(body.roomLinks);
        const userId: string | undefined = typeof body.userId === 'string' ? body.userId.trim() || undefined : undefined;
        const counterpartyIds: string[] = Array.isArray(body.counterpartyIds)
            ? body.counterpartyIds.filter((id: unknown) => typeof id === 'string' && id.trim())
            : [];
        const comment: string = body.comment?.trim() ?? '';

        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID кэшфлоу не указан' },
                { status: 400 },
            );
        }

        if (!name) {
            return NextResponse.json(
                { success: false, message: 'Название кэшфлоу не может быть пустым' },
                { status: 400 },
            );
        }

        if (!VALID_TYPES.includes(type as CashflowType)) {
            return NextResponse.json(
                { success: false, message: 'Некорректный тип кэшфлоу' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<CashflowDb>('cashflows');

        let existing: CashflowDb | null = null;
        try {
            existing = await collection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID кэшфлоу' },
                { status: 400 },
            );
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Кэшфлоу не найден' },
                { status: 404 },
            );
        }

        const duplicate = await collection.findOne({
            _id: { $ne: existing._id },
            name,
        });
        if (duplicate) {
            return NextResponse.json(
                { success: false, message: 'Кэшфлоу с таким названием уже существует' },
                { status: 400 },
            );
        }

        const updateData: Partial<CashflowDb> = {
            name,
            type: type as CashflowType,
            roomLinks,
            counterpartyIds,
            comment: comment || '',
        };
        if (userId !== undefined) updateData.userId = userId;

        await collection.updateOne(
            { _id: existing._id },
            { $set: updateData },
        );

        const uid = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'cashflow',
            entityId: id,
            action: 'update',
            userId: uid,
            userName,
            userRole,
            description: `Обновлён кэшфлоу: ${existing.name}`,
            oldData: existing,
            newData: updateData,
            metadata: {},
        });

        return NextResponse.json({
            success: true,
            message: 'Кэшфлоу успешно обновлён',
        });
    } catch (error) {
        console.error('Error in PUT /api/cashflows:', error);
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
                { success: false, message: 'ID кэшфлоу не указан' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<CashflowDb>('cashflows');

        let existing: CashflowDb | null = null;
        try {
            existing = await collection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID кэшфлоу' },
                { status: 400 },
            );
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Кэшфлоу не найден' },
                { status: 404 },
            );
        }

        await collection.deleteOne({ _id: existing._id });

        const uid = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'cashflow',
            entityId: id,
            action: 'delete',
            userId: uid,
            userName,
            userRole,
            description: `Удалён кэшфлоу: ${existing.name}`,
            oldData: existing,
            metadata: {},
        });

        return NextResponse.json({
            success: true,
            message: 'Кэшфлоу успешно удалён',
        });
    } catch (error) {
        console.error('Error in DELETE /api/cashflows:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

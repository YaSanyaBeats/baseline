import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { AutoAccountingRule, AutoAccountingPeriod, AutoAccountingAmountSource } from '@/lib/types';
import { ObjectId, Filter } from 'mongodb';

type RuleDb = AutoAccountingRule & { _id?: ObjectId };

function parseRoomId(b: Record<string, unknown>): number | 'all' | undefined {
    if (b.roomId === 'all') return 'all';
    if (typeof b.roomId === 'number' && !Number.isNaN(b.roomId)) return b.roomId;
    if (typeof b.roomId === 'string' && b.roomId.trim() !== '' && b.roomId !== 'all') {
        const n = Number(b.roomId);
        if (!Number.isNaN(n)) return n;
    }
    return undefined;
}

const VALID_AMOUNT_SOURCES: AutoAccountingAmountSource[] = ['manual', 'booking_price', 'internet_cost', 'category'];

function parseAmountSource(b: Record<string, unknown>): AutoAccountingAmountSource | undefined {
    if (typeof b.amountSource === 'string' && VALID_AMOUNT_SOURCES.includes(b.amountSource as AutoAccountingAmountSource)) {
        return b.amountSource as AutoAccountingAmountSource;
    }
    return undefined;
}

function parseRuleBody(body: unknown): { ruleType?: 'expense' | 'income'; objectId?: number | 'all'; roomId?: number | 'all'; category?: string; quantity?: number; amount?: number; amountSource?: AutoAccountingAmountSource; period?: AutoAccountingPeriod; order?: number } | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    const out: { ruleType?: 'expense' | 'income'; objectId?: number | 'all'; roomId?: number | 'all'; category?: string; quantity?: number; amount?: number; amountSource?: AutoAccountingAmountSource; period?: AutoAccountingPeriod; order?: number } = {};
    if (b.ruleType === 'expense' || b.ruleType === 'income') out.ruleType = b.ruleType;
    if (b.objectId === 'all') out.objectId = 'all';
    else if (typeof b.objectId === 'number' && !Number.isNaN(b.objectId)) out.objectId = b.objectId;
    else if (typeof b.objectId === 'string' && b.objectId.trim() !== '' && b.objectId !== 'all') {
        const n = Number(b.objectId);
        if (!Number.isNaN(n)) out.objectId = n;
    }
    const roomId = parseRoomId(b);
    if (roomId !== undefined) out.roomId = roomId;
    if (typeof b.category === 'string') out.category = b.category.trim();
    if (typeof b.quantity === 'number' && b.quantity >= 1) out.quantity = b.quantity;
    if (typeof b.amount === 'number' && b.amount >= 0) out.amount = b.amount;
    const amountSource = parseAmountSource(b);
    if (amountSource !== undefined) out.amountSource = amountSource;
    if (b.period === 'per_booking' || b.period === 'per_month') out.period = b.period;
    if (typeof b.order === 'number' && Number.isInteger(b.order)) out.order = b.order;
    return Object.keys(out).length ? out : null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const { id } = await params;
        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID правила не указан' },
                { status: 400 },
            );
        }

        const body = await request.json();
        const parsed = parseRuleBody(body);
        if (!parsed || Object.keys(parsed).length === 0) {
            return NextResponse.json(
                { success: false, message: 'Нет полей для обновления' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<RuleDb>('autoAccountingRules');

        let oid: ObjectId;
        try {
            oid = new ObjectId(id);
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID правила' },
                { status: 400 },
            );
        }

        const updateData: Partial<RuleDb> = { ...parsed };
        await collection.updateOne({ _id: oid } as Filter<RuleDb>, { $set: updateData });

        return NextResponse.json({
            success: true,
            message: 'Правило автоучёта обновлено',
        });
    } catch (error) {
        console.error('Error in PUT /api/autoAccounting/rules/[id]:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const { id } = await params;
        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID правила не указан' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<RuleDb>('autoAccountingRules');

        let oid: ObjectId;
        try {
            oid = new ObjectId(id);
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID правила' },
                { status: 400 },
            );
        }

        const deleted = await collection.deleteOne({ _id: oid } as Filter<RuleDb>);
        if (deleted.deletedCount === 0) {
            return NextResponse.json(
                { success: false, message: 'Правило не найдено' },
                { status: 404 },
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Правило автоучёта удалено',
        });
    } catch (error) {
        console.error('Error in DELETE /api/autoAccounting/rules/[id]:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { AutoAccountingRule, AutoAccountingPeriod, AutoAccountingAmountSource } from '@/lib/types';
import { ObjectId } from 'mongodb';

type RuleDb = AutoAccountingRule & { _id?: ObjectId };

export async function GET() {
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

        const db = await getDB();
        const rules = await db.collection<RuleDb>('autoAccountingRules').find({}).sort({ order: 1 }).toArray();

        return NextResponse.json(rules);
    } catch (error) {
        console.error('Error in GET /api/autoAccounting/rules:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

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

function parseRuleBody(body: unknown): { ruleType: 'expense' | 'income'; objectId: number | 'all'; roomId?: number | 'all'; category: string; quantity: number; amount?: number; amountSource?: AutoAccountingAmountSource; period: AutoAccountingPeriod; order: number } | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    const ruleType = b.ruleType === 'expense' || b.ruleType === 'income' ? b.ruleType : null;
    let objectId: number | 'all' = 'all';
    if (b.objectId === 'all') objectId = 'all';
    else if (typeof b.objectId === 'number' && !Number.isNaN(b.objectId)) objectId = b.objectId;
    else if (typeof b.objectId === 'string' && b.objectId.trim() !== '' && b.objectId !== 'all') {
        const n = Number(b.objectId);
        if (!Number.isNaN(n)) objectId = n;
    }
    const roomId = parseRoomId(b);
    const category = typeof b.category === 'string' ? b.category.trim() : '';
    const quantity = typeof b.quantity === 'number' && b.quantity >= 1 ? b.quantity : 1;
    const amount = typeof b.amount === 'number' && b.amount >= 0 ? b.amount : undefined;
    const amountSource = parseAmountSource(b);
    const period = b.period === 'per_booking' || b.period === 'per_month' ? b.period : 'per_booking';
    const order = typeof b.order === 'number' && Number.isInteger(b.order) ? b.order : 0;

    if (!ruleType || !category) return null;
    const result: { ruleType: 'expense' | 'income'; objectId: number | 'all'; roomId?: number | 'all'; category: string; quantity: number; amount?: number; amountSource?: AutoAccountingAmountSource; period: AutoAccountingPeriod; order: number } = { ruleType, objectId, category, quantity, amount, period, order };
    if (roomId !== undefined) result.roomId = roomId;
    if (amountSource !== undefined) result.amountSource = amountSource;
    return result;
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

        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const parsed = parseRuleBody(body);
        if (!parsed) {
            return NextResponse.json(
                { success: false, message: 'Некорректные данные правила (тип и категория обязательны)' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<RuleDb>('autoAccountingRules');
        const maxOrder = await collection.find({}).sort({ order: -1 }).limit(1).toArray();
        const order = parsed.order >= 0 ? parsed.order : (maxOrder[0]?.order ?? -1) + 1;

        const toInsert: RuleDb = {
            ruleType: parsed.ruleType,
            objectId: parsed.objectId,
            category: parsed.category,
            quantity: parsed.quantity,
            period: parsed.period,
            order,
            ...(parsed.amount !== undefined && { amount: parsed.amount }),
            ...(parsed.roomId !== undefined && { roomId: parsed.roomId }),
            ...(parsed.amountSource !== undefined && { amountSource: parsed.amountSource }),
            createdAt: new Date(),
        };

        await collection.insertOne(toInsert as any);

        return NextResponse.json({
            success: true,
            message: 'Правило автоучёта добавлено',
        });
    } catch (error) {
        console.error('Error in POST /api/autoAccounting/rules:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

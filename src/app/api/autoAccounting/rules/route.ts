import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { AutoAccountingRule, AutoAccountingPeriod, AutoAccountingAmountSource, AutoAccountingQuantitySource } from '@/lib/types';
import { parseSourceRecipientValue } from '@/lib/sourceRecipientParse';
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

function parseRoomName(b: Record<string, unknown>): string | 'all' | undefined {
    if (b.roomName === 'all') return 'all';
    if (typeof b.roomName === 'string' && b.roomName.trim() !== '' && b.roomName !== 'all') {
        return b.roomName.trim();
    }
    return undefined;
}

const VALID_AMOUNT_SOURCES: AutoAccountingAmountSource[] = ['manual', 'booking_price', 'internet_cost', 'category'];
const VALID_QUANTITY_SOURCES: AutoAccountingQuantitySource[] = ['manual', 'guests', 'guests_div_2'];
const VALID_OBJECT_META_FIELDS = ['district', 'objectType'] as const;
const VALID_ROOM_META_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'] as const;

function parseAmountSource(b: Record<string, unknown>): AutoAccountingAmountSource | undefined {
    if (typeof b.amountSource === 'string' && VALID_AMOUNT_SOURCES.includes(b.amountSource as AutoAccountingAmountSource)) {
        return b.amountSource as AutoAccountingAmountSource;
    }
    return undefined;
}

function parseQuantitySource(b: Record<string, unknown>): AutoAccountingQuantitySource | undefined {
    if (typeof b.quantitySource === 'string' && VALID_QUANTITY_SOURCES.includes(b.quantitySource as AutoAccountingQuantitySource)) {
        return b.quantitySource as AutoAccountingQuantitySource;
    }
    return undefined;
}

type ParsedRule = {
    name?: string;
    ruleType: 'expense' | 'income';
    objectId: number | 'all';
    roomName?: string | 'all';
    objectMetadataField?: 'district' | 'objectType';
    objectMetadataValue?: string;
    roomMetadataField?: string;
    roomMetadataOperator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
    roomMetadataValue?: string | number;
    category: string;
    quantity: number;
    quantitySource?: AutoAccountingQuantitySource;
    amount?: number;
    amountSource?: AutoAccountingAmountSource;
    period: AutoAccountingPeriod;
    order: number;
    source?: string;
    recipient?: string;
};

function parseRuleBody(body: unknown): ParsedRule | null {
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
    const roomName = parseRoomName(b);
    const category = typeof b.category === 'string' ? b.category.trim() : '';
    const quantity = typeof b.quantity === 'number' && b.quantity >= 1 ? b.quantity : 1;
    const amount = typeof b.amount === 'number' && b.amount >= 0 ? b.amount : undefined;
    const amountSource = parseAmountSource(b);
    const quantitySource = parseQuantitySource(b);
    const period = b.period === 'per_booking' || b.period === 'per_month' ? b.period : 'per_booking';
    const order = typeof b.order === 'number' && Number.isInteger(b.order) ? b.order : 0;

    const objectMetadataField = typeof b.objectMetadataField === 'string' && VALID_OBJECT_META_FIELDS.includes(b.objectMetadataField as any) ? b.objectMetadataField as 'district' | 'objectType' : undefined;
    const objectMetadataValue = typeof b.objectMetadataValue === 'string' ? b.objectMetadataValue.trim() || undefined : undefined;
    const roomMetadataField = typeof b.roomMetadataField === 'string' && b.roomMetadataField.trim() ? b.roomMetadataField.trim() : undefined;
    const roomMetadataOperator = typeof b.roomMetadataOperator === 'string' && VALID_ROOM_META_OPERATORS.includes(b.roomMetadataOperator as (typeof VALID_ROOM_META_OPERATORS)[number]) ? (b.roomMetadataOperator as (typeof VALID_ROOM_META_OPERATORS)[number]) : undefined;
    const roomMetadataValue = roomMetadataField != null && (typeof b.roomMetadataValue === 'string' || typeof b.roomMetadataValue === 'number') ? b.roomMetadataValue : undefined;
    const name = typeof b.name === 'string' ? b.name.trim() || undefined : undefined;

    if (!ruleType || !category) return null;
    const result: ParsedRule = { ruleType, objectId, category, quantity, amount, period, order };

    if ('source' in b) {
        if (b.source === null || b.source === '') {
            /* не сохраняем пустым при создании */
        } else if (typeof b.source === 'string') {
            const s = b.source.trim();
            if (!parseSourceRecipientValue(s)) return null;
            result.source = s;
        } else return null;
    }
    if ('recipient' in b) {
        if (b.recipient === null || b.recipient === '') {
            /* omit */
        } else if (typeof b.recipient === 'string') {
            const s = b.recipient.trim();
            if (!parseSourceRecipientValue(s)) return null;
            result.recipient = s;
        } else return null;
    }
    if (name !== undefined) result.name = name;
    if (roomName !== undefined) result.roomName = roomName;
    if (amountSource !== undefined) result.amountSource = amountSource;
    if (quantitySource !== undefined) result.quantitySource = quantitySource;
    if (objectMetadataField !== undefined) result.objectMetadataField = objectMetadataField;
    if (objectMetadataValue !== undefined) result.objectMetadataValue = objectMetadataValue;
    if (roomMetadataField !== undefined) result.roomMetadataField = roomMetadataField;
    if (roomMetadataOperator !== undefined) result.roomMetadataOperator = roomMetadataOperator;
    if (roomMetadataValue !== undefined) result.roomMetadataValue = roomMetadataValue;
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
            ...(parsed.name !== undefined && { name: parsed.name }),
            ...(parsed.amount !== undefined && { amount: parsed.amount }),
            ...(parsed.roomName !== undefined && { roomName: parsed.roomName }),
            ...(parsed.amountSource !== undefined && { amountSource: parsed.amountSource }),
            ...(parsed.quantitySource !== undefined && { quantitySource: parsed.quantitySource }),
            ...(parsed.objectMetadataField !== undefined && { objectMetadataField: parsed.objectMetadataField }),
            ...(parsed.objectMetadataValue !== undefined && { objectMetadataValue: parsed.objectMetadataValue }),
            ...(parsed.roomMetadataField !== undefined && { roomMetadataField: parsed.roomMetadataField }),
            ...(parsed.roomMetadataOperator !== undefined && { roomMetadataOperator: parsed.roomMetadataOperator }),
            ...(parsed.roomMetadataValue !== undefined && { roomMetadataValue: parsed.roomMetadataValue }),
            ...(parsed.source !== undefined && { source: parsed.source }),
            ...(parsed.recipient !== undefined && { recipient: parsed.recipient }),
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

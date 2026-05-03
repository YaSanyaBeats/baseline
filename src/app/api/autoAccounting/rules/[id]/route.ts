import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { AutoAccountingRule, AutoAccountingPeriod, AutoAccountingAmountSource, AutoAccountingQuantitySource } from '@/lib/types';
import { parseSourceRecipientValue } from '@/lib/sourceRecipientParse';
import { ObjectId, Filter } from 'mongodb';

type RuleDb = AutoAccountingRule & { _id?: ObjectId };

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

type PartialRuleUpdate = Partial<Pick<AutoAccountingRule, 'name' | 'ruleType' | 'objectId' | 'roomName' | 'category' | 'quantity' | 'amount' | 'amountSource' | 'quantitySource' | 'period' | 'order' | 'objectMetadataField' | 'objectMetadataValue' | 'roomMetadataField' | 'roomMetadataOperator' | 'roomMetadataValue'>>;

function parseRuleBody(body: unknown): PartialRuleUpdate | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    const out: PartialRuleUpdate = {};
    if (typeof b.name === 'string') out.name = b.name.trim() || undefined;
    if (b.ruleType === 'expense' || b.ruleType === 'income') out.ruleType = b.ruleType;
    if (b.objectId === 'all') out.objectId = 'all';
    else if (typeof b.objectId === 'number' && !Number.isNaN(b.objectId)) out.objectId = b.objectId;
    else if (typeof b.objectId === 'string' && b.objectId.trim() !== '' && b.objectId !== 'all') {
        const n = Number(b.objectId);
        if (!Number.isNaN(n)) out.objectId = n;
    }
    const roomName = parseRoomName(b);
    if (roomName !== undefined) out.roomName = roomName;
    if (typeof b.category === 'string') out.category = b.category.trim();
    if (typeof b.quantity === 'number' && b.quantity >= 1) out.quantity = b.quantity;
    if (typeof b.amount === 'number' && b.amount >= 0) out.amount = b.amount;
    const amountSource = parseAmountSource(b);
    if (amountSource !== undefined) out.amountSource = amountSource;
    const quantitySource = parseQuantitySource(b);
    if (quantitySource !== undefined) out.quantitySource = quantitySource;
    if (b.period === 'per_booking' || b.period === 'per_month') out.period = b.period;
    if (typeof b.order === 'number' && Number.isInteger(b.order)) out.order = b.order;
    if (typeof b.objectMetadataField === 'string' && VALID_OBJECT_META_FIELDS.includes(b.objectMetadataField as any)) out.objectMetadataField = b.objectMetadataField as 'district' | 'objectType';
    if (typeof b.objectMetadataValue === 'string') out.objectMetadataValue = b.objectMetadataValue.trim() || undefined;
    if (typeof b.roomMetadataField === 'string' && b.roomMetadataField.trim()) out.roomMetadataField = b.roomMetadataField.trim();
    if (typeof b.roomMetadataOperator === 'string' && VALID_ROOM_META_OPERATORS.includes(b.roomMetadataOperator as any)) out.roomMetadataOperator = b.roomMetadataOperator as any;
    if (typeof b.roomMetadataValue === 'string' || typeof b.roomMetadataValue === 'number') out.roomMetadataValue = b.roomMetadataValue;
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

        const body = await request.json() as Record<string, unknown>;
        const parsed = parseRuleBody(body);

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

        const updateData: Partial<RuleDb> = parsed ? { ...parsed } : {};
        const unsetKeys: string[] = [];
        if (parsed && 'roomName' in parsed && parsed.roomName !== undefined) {
            unsetKeys.push('roomId');
        }
        if (body.objectMetadataField === '' || body.objectMetadataField === null) {
            unsetKeys.push('objectMetadataField', 'objectMetadataValue');
            delete updateData.objectMetadataField;
            delete updateData.objectMetadataValue;
        }
        if (body.roomMetadataField === '' || body.roomMetadataField === null) {
            unsetKeys.push('roomMetadataField', 'roomMetadataOperator', 'roomMetadataValue', 'roomMetadataValueTo');
            delete updateData.roomMetadataField;
            delete updateData.roomMetadataOperator;
            delete updateData.roomMetadataValue;
            delete (updateData as Record<string, unknown>).roomMetadataValueTo;
        }
        if ('source' in body) {
            if (body.source === null || body.source === '') {
                unsetKeys.push('source');
            } else if (typeof body.source === 'string') {
                const s = body.source.trim();
                if (!parseSourceRecipientValue(s)) {
                    return NextResponse.json(
                        { success: false, message: 'Некорректное значение «От кого»' },
                        { status: 400 },
                    );
                }
                updateData.source = s;
            } else {
                return NextResponse.json(
                    { success: false, message: 'Некорректное значение «От кого»' },
                    { status: 400 },
                );
            }
        }
        if ('recipient' in body) {
            if (body.recipient === null || body.recipient === '') {
                unsetKeys.push('recipient');
            } else if (typeof body.recipient === 'string') {
                const s = body.recipient.trim();
                if (!parseSourceRecipientValue(s)) {
                    return NextResponse.json(
                        { success: false, message: 'Некорректное значение «Кому»' },
                        { status: 400 },
                    );
                }
                updateData.recipient = s;
            } else {
                return NextResponse.json(
                    { success: false, message: 'Некорректное значение «Кому»' },
                    { status: 400 },
                );
            }
        }

        const setKeys = Object.keys(updateData);
        const hasUpdates = setKeys.length > 0 || unsetKeys.length > 0;
        if (!hasUpdates) {
            return NextResponse.json(
                { success: false, message: 'Нет полей для обновления' },
                { status: 400 },
            );
        }

        const updateOp: Record<string, unknown> = setKeys.length > 0 ? { $set: updateData } : {};
        if (unsetKeys.length) updateOp.$unset = Object.fromEntries(unsetKeys.map((k) => [k, 1]));
        await collection.updateOne({ _id: oid } as Filter<RuleDb>, updateOp as any);

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

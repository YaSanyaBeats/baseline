import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { CashflowRule, CashflowRuleFilter, CashflowRuleFilterType } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { logAuditAction } from '@/lib/auditLog';

type CashflowRuleDb = Omit<CashflowRule, '_id'> & { _id?: ObjectId };

const VALID_FILTER_LOGIC = ['and', 'or'] as const;

const VALID_FILTER_TYPES = [
    'rooms', 'metadata', 'counterparty', 'category', 'roomMetadata', 'booking',
    'bookingDate', 'recordDate', 'amount', 'reportMonth', 'status', 'recordType',
] as const;

function parseFilters(body: unknown): CashflowRuleFilter[] {
    const arr = Array.isArray(body) ? body : [];
    return arr
        .filter(
            (f: unknown): f is Record<string, unknown> =>
                typeof f === 'object' && f !== null && typeof (f as any).id === 'string' && typeof (f as any).type === 'string'
        )
        .map((f: Record<string, unknown>) => {
            const type = VALID_FILTER_TYPES.includes(String(f.type) as any) ? f.type : 'rooms';
            const filter: CashflowRuleFilter = {
                id: String(f.id),
                type: type as CashflowRuleFilterType,
            };
            if (f.roomLinks && Array.isArray(f.roomLinks)) {
                filter.roomLinks = f.roomLinks.filter(
                    (r: unknown): r is { id: number; rooms: number[] } =>
                        typeof (r as any)?.id === 'number' && Array.isArray((r as any)?.rooms)
                ) as { id: number; rooms: number[] }[];
            }
            if (typeof f.metadataField === 'string') filter.metadataField = f.metadataField;
            if (typeof f.metadataValue === 'string') filter.metadataValue = f.metadataValue;
            if (typeof f.counterpartyId === 'string') filter.counterpartyId = f.counterpartyId;
            if (['source', 'recipient', 'both'].includes(String(f.sourceOrRecipient)))
                filter.sourceOrRecipient = f.sourceOrRecipient as 'source' | 'recipient' | 'both';
            if (Array.isArray(f.categoryNames)) filter.categoryNames = f.categoryNames.filter((x): x is string => typeof x === 'string');
            if (typeof f.roomMetadataField === 'string') filter.roomMetadataField = f.roomMetadataField;
            if (['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'after', 'before'].includes(String(f.roomMetadataOperator)))
                filter.roomMetadataOperator = f.roomMetadataOperator as CashflowRuleFilter['roomMetadataOperator'];
            if (f.roomMetadataValue !== undefined) filter.roomMetadataValue = typeof f.roomMetadataValue === 'number' ? f.roomMetadataValue : String(f.roomMetadataValue);
            if (f.roomMetadataValueTo !== undefined) filter.roomMetadataValueTo = typeof f.roomMetadataValueTo === 'number' ? f.roomMetadataValueTo : String(f.roomMetadataValueTo);
            if (typeof f.hasBooking === 'boolean') filter.hasBooking = f.hasBooking;
            if (Array.isArray(f.bookingIds)) filter.bookingIds = f.bookingIds.filter((x): x is number => typeof x === 'number');
            if (['arrival', 'departure'].includes(String(f.bookingDateField))) filter.bookingDateField = f.bookingDateField as 'arrival' | 'departure';
            if (['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'after', 'before'].includes(String(f.bookingDateOperator)))
                filter.bookingDateOperator = f.bookingDateOperator as CashflowRuleFilter['bookingDateOperator'];
            if (typeof f.bookingDateValue === 'string') filter.bookingDateValue = f.bookingDateValue;
            if (typeof f.bookingDateValueTo === 'string') filter.bookingDateValueTo = f.bookingDateValueTo;
            if (['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'after', 'before'].includes(String(f.recordDateOperator)))
                filter.recordDateOperator = f.recordDateOperator as CashflowRuleFilter['recordDateOperator'];
            if (typeof f.recordDateValue === 'string') filter.recordDateValue = f.recordDateValue;
            if (typeof f.recordDateValueTo === 'string') filter.recordDateValueTo = f.recordDateValueTo;
            if (['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'].includes(String(f.amountOperator)))
                filter.amountOperator = f.amountOperator as CashflowRuleFilter['amountOperator'];
            if (typeof f.amountValue === 'number') filter.amountValue = f.amountValue;
            if (typeof f.amountValueTo === 'number') filter.amountValueTo = f.amountValueTo;
            if (typeof f.reportMonth === 'string') filter.reportMonth = f.reportMonth;
            if (Array.isArray(f.reportMonths)) filter.reportMonths = f.reportMonths.filter((x): x is string => typeof x === 'string');
            if (['draft', 'confirmed'].includes(String(f.recordStatus))) filter.recordStatus = f.recordStatus as 'draft' | 'confirmed';
            if (['expense', 'income'].includes(String(f.recordType))) filter.recordType = f.recordType as 'expense' | 'income';
            return filter;
        });
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
        const collection = db.collection<CashflowRuleDb>('cashflowRules');

        const rules = await collection
            .find({})
            .sort({ name: 1 })
            .toArray();

        return NextResponse.json(rules);
    } catch (error) {
        console.error('Error in GET /api/cashflowRules:', error);
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
        const name: string = body.name?.trim() ?? '';
        const filterLogic = VALID_FILTER_LOGIC.includes(body.filterLogic) ? body.filterLogic : 'and';
        const filters = parseFilters(body.filters);
        const balanceSign =
            body.balanceSign === 'plus' || body.balanceSign === 'minus'
                ? body.balanceSign
                : body.positiveSign === true
                  ? 'plus'
                  : 'minus';

        if (!name) {
            return NextResponse.json(
                { success: false, message: 'Название правила не может быть пустым' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<CashflowRuleDb>('cashflowRules');

        const ruleToInsert: CashflowRuleDb = {
            name,
            filterLogic,
            filters,
            balanceSign,
            createdAt: new Date(),
        };

        const result = await collection.insertOne(ruleToInsert as any);

        const uid = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'other',
            entityId: result.insertedId.toString(),
            action: 'create',
            userId: uid,
            userName,
            userRole,
            description: `Создано правило кэшфлоу: ${name}`,
            newData: ruleToInsert,
            metadata: {},
        });

        return NextResponse.json({
            success: true,
            message: 'Правило успешно создано',
        });
    } catch (error) {
        console.error('Error in POST /api/cashflowRules:', error);
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
        const filterLogic = VALID_FILTER_LOGIC.includes(body.filterLogic) ? body.filterLogic : 'and';
        const filters = parseFilters(body.filters);
        const balanceSign =
            body.balanceSign === 'plus' || body.balanceSign === 'minus'
                ? body.balanceSign
                : body.positiveSign === true
                  ? 'plus'
                  : 'minus';

        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID правила не указан' },
                { status: 400 },
            );
        }

        if (!name) {
            return NextResponse.json(
                { success: false, message: 'Название правила не может быть пустым' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<CashflowRuleDb>('cashflowRules');

        let existing: CashflowRuleDb | null = null;
        try {
            existing = await collection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID правила' },
                { status: 400 },
            );
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Правило не найдено' },
                { status: 404 },
            );
        }

        const updateData: Partial<CashflowRuleDb> = {
            name,
            filterLogic,
            filters,
            balanceSign,
        };

        await collection.updateOne(
            { _id: existing._id },
            { $set: updateData },
        );

        const uid = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'other',
            entityId: id,
            action: 'update',
            userId: uid,
            userName,
            userRole,
            description: `Обновлено правило кэшфлоу: ${existing.name}`,
            oldData: existing,
            newData: updateData,
            metadata: {},
        });

        return NextResponse.json({
            success: true,
            message: 'Правило успешно обновлено',
        });
    } catch (error) {
        console.error('Error in PUT /api/cashflowRules:', error);
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
                { success: false, message: 'ID правила не указан' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<CashflowRuleDb>('cashflowRules');

        let existing: CashflowRuleDb | null = null;
        try {
            existing = await collection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID правила' },
                { status: 400 },
            );
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Правило не найдено' },
                { status: 404 },
            );
        }

        await collection.deleteOne({ _id: existing._id });

        const uid = (session.user as any)._id;
        const userName = (session.user as any).name || session.user.name || 'Unknown';
        await logAuditAction({
            entity: 'other',
            entityId: id,
            action: 'delete',
            userId: uid,
            userName,
            userRole,
            description: `Удалено правило кэшфлоу: ${existing.name}`,
            oldData: existing,
            metadata: {},
        });

        return NextResponse.json({
            success: true,
            message: 'Правило успешно удалено',
        });
    } catch (error) {
        console.error('Error in DELETE /api/cashflowRules:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}

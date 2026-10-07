import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { getObjects } from '@/lib/server/getObjects';
import { transactionMatchesOwnerAssignment } from '@/lib/ownerObjectsFilter';
import { buildCategoryNameByIdMap, resolveCategoryName } from '@/lib/accountancyCategoryResolve';
import {
    isOwnerBalanceCategory,
    resolveOwnerBalanceCanonicalCategoryName,
} from '@/lib/ownerBalanceCategories';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { isAdminImpersonatingOwner } from '@/lib/impersonationAccess';
import type { AccountancyCategory, UserObject } from '@/lib/types';

type SessionUser = {
    login?: string;
    id?: string;
    user?: { login?: string };
};

function sessionLogin(sessionUser: SessionUser): string {
    return sessionUser.login || sessionUser.id || sessionUser.user?.login || '';
}

function asIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return '';
}

function slimRecord(doc: Record<string, unknown>) {
    return {
        _id: normalizeMongoIdString(doc._id),
        objectId: Number(doc.objectId),
        roomName: (doc.roomName as string | null | undefined) ?? null,
        date: asIso(doc.date),
        reportMonth: typeof doc.reportMonth === 'string' ? doc.reportMonth : undefined,
        categoryId: doc.categoryId != null ? normalizeMongoIdString(doc.categoryId) : null,
        category: String(doc.category ?? ''),
        quantity: typeof doc.quantity === 'number' ? doc.quantity : undefined,
        amount: Number(doc.amount ?? 0),
        status: doc.status === 'draft' ? ('draft' as const) : ('confirmed' as const),
        accountantId: '',
    };
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        const login = sessionLogin(session.user as SessionUser);
        if (!login) {
            return NextResponse.json(
                { success: false, message: 'Пользователь не найден' },
                { status: 400 }
            );
        }

        const db = await getDB();
        const user = await db.collection('users').findOne(
            { login },
            { projection: { password: 0 } }
        );
        if (!user) {
            return NextResponse.json(
                { success: false, message: 'Пользователь не найден' },
                { status: 404 }
            );
        }
        const isPremiumOwner = user.role === 'owner' && user.accountType === 'premium';
        if (!isPremiumOwner && !isAdminImpersonatingOwner(session)) {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 }
            );
        }

        const assignments = (Array.isArray(user.objects) ? user.objects : []) as UserObject[];
        const allObjects = await getObjects();
        const ownerObjects = allObjects.filter((obj) =>
            assignments.some((uo) => uo.id === obj.id || uo.id === obj.propertyId)
        );

        const objectIds = new Set<number>();
        for (const uo of assignments) {
            if (typeof uo.id === 'number') objectIds.add(uo.id);
        }
        for (const obj of ownerObjects) {
            objectIds.add(obj.id);
            if (typeof obj.propertyId === 'number') objectIds.add(obj.propertyId);
        }

        const idList = [...objectIds];
        const empty = { transactions: [], incomes: [], expenses: [] };
        if (idList.length === 0) {
            return NextResponse.json(empty);
        }

        const recordProjection = {
            objectId: 1,
            roomName: 1,
            date: 1,
            reportMonth: 1,
            categoryId: 1,
            category: 1,
            quantity: 1,
            amount: 1,
            status: 1,
        };
        const [expenseDocs, incomeDocs, categoryDocs] = await Promise.all([
            db.collection('expenses').find({ objectId: { $in: idList } }, { projection: recordProjection }).toArray(),
            db.collection('incomes').find({ objectId: { $in: idList } }, { projection: recordProjection }).toArray(),
            db
                .collection('accountancyCategories')
                .find({}, { projection: { name: 1, nameEn: 1, type: 1 } })
                .toArray(),
        ]);

        const categoryNameById = buildCategoryNameByIdMap(
            categoryDocs.map((c) => ({
                _id: normalizeMongoIdString(c._id),
                name: String(c.name ?? ''),
                nameEn: c.nameEn != null ? String(c.nameEn) : undefined,
                type: c.type === 'income' ? 'income' : 'expense',
            })) as AccountancyCategory[],
            'ru'
        );

        const matchOwner = (record: { objectId: number; roomName?: string | null }) =>
            transactionMatchesOwnerAssignment(record, assignments, ownerObjects);

        const expenses = expenseDocs.map((doc) => slimRecord(doc)).filter(matchOwner);
        const incomes = incomeDocs.map((doc) => slimRecord(doc)).filter(matchOwner);

        const transactions = [];
        for (const record of expenses) {
            if (!record._id || !isOwnerBalanceCategory(record, categoryNameById)) continue;
            const category =
                resolveOwnerBalanceCanonicalCategoryName(record, categoryNameById) ??
                resolveCategoryName(record, categoryNameById);
            transactions.push({
                _id: record._id,
                recordType: 'expense' as const,
                date: record.date,
                categoryId: record.categoryId,
                category,
                objectId: record.objectId,
                roomName: record.roomName,
                reportMonth: record.reportMonth,
                status: record.status,
                quantity: record.quantity,
                amount: record.amount,
            });
        }
        for (const record of incomes) {
            if (!record._id || !isOwnerBalanceCategory(record, categoryNameById)) continue;
            const category =
                resolveOwnerBalanceCanonicalCategoryName(record, categoryNameById) ??
                resolveCategoryName(record, categoryNameById);
            transactions.push({
                _id: record._id,
                recordType: 'income' as const,
                date: record.date,
                categoryId: record.categoryId,
                category,
                objectId: record.objectId,
                roomName: record.roomName,
                reportMonth: record.reportMonth,
                status: record.status,
                quantity: record.quantity,
                amount: record.amount,
            });
        }

        return NextResponse.json(
            { transactions, incomes, expenses },
            {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                    Pragma: 'no-cache',
                },
            }
        );
    } catch (error) {
        console.error('Error in GET /api/owner-statistics:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

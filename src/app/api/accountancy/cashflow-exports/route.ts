import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { ObjectId } from 'mongodb';
import { getDB } from '@/lib/db/getDB';
import { logAuditAction } from '@/lib/auditLog';
import { isValidReportMonthKey } from '@/lib/accountancyClosedMonth';
import {
    cashflowIdMongoClause,
    verifyCashflowIdForTransactionList,
} from '@/lib/accountancyCashflowIdQueryAuth';
import { getObjects } from '@/lib/server/getObjects';
import { normalizeMongoIdString } from '@/lib/mongoId';
import {
    buildCashflowExportXlsxBuffer,
    isMonthInRange,
    ledgerMonthFromRecord,
} from '@/lib/server/buildCashflowExportXlsx';
import type { Expense, Income } from '@/lib/types';

const COLLECTION = 'cashflowExports';
const UPLOAD_DIR = 'uploads/accountancy/cashflow-exports';

function requireAccountantOrAdmin(session: Session | null) {
    if (!session?.user) {
        return { ok: false as const, status: 401, message: 'Необходима авторизация' };
    }
    const userRole = (session.user as { role?: string }).role;
    if (userRole !== 'admin' && userRole !== 'accountant') {
        return { ok: false as const, status: 403, message: 'Недостаточно прав' };
    }
    return { ok: true as const, session };
}

function serializeExport(doc: Record<string, unknown>) {
    return {
        _id: normalizeMongoIdString(doc._id),
        userId: String(doc.userId ?? ''),
        cashflowId: String(doc.cashflowId ?? ''),
        fromMonth: String(doc.fromMonth ?? ''),
        toMonth: String(doc.toMonth ?? ''),
        fileName: String(doc.fileName ?? ''),
        url: String(doc.url ?? ''),
        rowCount: Number(doc.rowCount ?? 0),
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt ?? ''),
        createdByName: String(doc.createdByName ?? ''),
    };
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const access = requireAccountantOrAdmin(session);
        if (!access.ok) {
            return NextResponse.json({ success: false, message: access.message }, { status: access.status });
        }

        const userId = request.nextUrl.searchParams.get('userId')?.trim() ?? '';
        if (!userId || !ObjectId.isValid(userId)) {
            return NextResponse.json({ success: false, message: 'Некорректный ID пользователя' }, { status: 400 });
        }

        const db = await getDB();
        const docs = await db
            .collection(COLLECTION)
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray();

        return NextResponse.json({
            success: true,
            exports: docs.map((d) => serializeExport(d as Record<string, unknown>)),
        });
    } catch (error) {
        console.error('Error in GET /api/accountancy/cashflow-exports:', error);
        return NextResponse.json({ success: false, message: 'Внутренняя ошибка сервера' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const access = requireAccountantOrAdmin(session);
        if (!access.ok) {
            return NextResponse.json({ success: false, message: access.message }, { status: access.status });
        }

        const body = await request.json().catch(() => ({}));
        const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
        const fromMonth = typeof body.fromMonth === 'string' ? body.fromMonth.trim() : '';
        const toMonth = typeof body.toMonth === 'string' ? body.toMonth.trim() : '';

        if (!userId || !ObjectId.isValid(userId)) {
            return NextResponse.json({ success: false, message: 'Некорректный ID пользователя' }, { status: 400 });
        }
        if (!isValidReportMonthKey(fromMonth) || !isValidReportMonthKey(toMonth)) {
            return NextResponse.json({ success: false, message: 'Укажите корректный диапазон месяцев' }, { status: 400 });
        }
        if (fromMonth > toMonth) {
            return NextResponse.json(
                { success: false, message: 'Месяц «с» не может быть позже месяца «по»' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const cashflow = await db.collection('cashflows').findOne({ userId });
        if (!cashflow?._id) {
            return NextResponse.json(
                { success: false, message: 'У пользователя нет привязанного центра учёта кешфлоу' },
                { status: 404 },
            );
        }

        const cashflowId = cashflow._id.toString();
        const cfCheck = await verifyCashflowIdForTransactionList(db, access.session, cashflowId);
        if (!cfCheck.ok) {
            return NextResponse.json({ success: false, message: cfCheck.message }, { status: cfCheck.status });
        }

        const employee = await db.collection('users').findOne(
            { _id: new ObjectId(userId) },
            { projection: { name: 1 } },
        );
        const employeeName = String(employee?.name ?? userId).trim() || userId;

        const cfClause = cashflowIdMongoClause(cfCheck.normalizedId);
        const [expenseDocs, incomeDocs, objects, counterparties, usersCf, cashflows] = await Promise.all([
            db.collection('expenses').find(cfClause).toArray(),
            db.collection('incomes').find(cfClause).toArray(),
            getObjects(),
            db.collection('counterparties').find({}, { projection: { name: 1 } }).toArray(),
            db.collection('users').find({ hasCashflow: true }, { projection: { name: 1 } }).toArray(),
            db.collection('cashflows').find({}, { projection: { name: 1 } }).toArray(),
        ]);

        const lookups = {
            objects,
            counterparties: counterparties.map((c) => ({
                _id: normalizeMongoIdString(c._id),
                name: String(c.name ?? ''),
            })),
            usersWithCashflow: usersCf.map((u) => ({
                _id: normalizeMongoIdString(u._id),
                name: String(u.name ?? ''),
            })),
            cashflows: cashflows.map((c) => ({
                _id: normalizeMongoIdString(c._id),
                name: String(c.name ?? ''),
            })),
        };

        const records: { type: 'expense' | 'income'; doc: Expense | Income }[] = [];
        for (const raw of expenseDocs) {
            const doc = { ...raw, _id: normalizeMongoIdString(raw._id) } as Expense;
            const month = ledgerMonthFromRecord(doc.date, doc.reportMonth);
            if (isMonthInRange(month, fromMonth, toMonth)) {
                records.push({ type: 'expense', doc });
            }
        }
        for (const raw of incomeDocs) {
            const doc = { ...raw, _id: normalizeMongoIdString(raw._id) } as Income;
            const month = ledgerMonthFromRecord(doc.date, doc.reportMonth);
            if (isMonthInRange(month, fromMonth, toMonth)) {
                records.push({ type: 'income', doc });
            }
        }

        const buffer = await buildCashflowExportXlsxBuffer(records, lookups);

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeFile = `cashflow-${userId}-${fromMonth}-${toMonth}-${stamp}.xlsx`;
        const downloadName = `${employeeName} ${fromMonth}–${toMonth}.xlsx`;
        const baseDir = path.join(process.cwd(), 'public', UPLOAD_DIR);
        await mkdir(baseDir, { recursive: true });
        await writeFile(path.join(baseDir, safeFile), buffer);

        const createdAt = new Date();
        const actor = access.session.user as { _id?: string; name?: string; role?: string };
        const insert = {
            userId,
            cashflowId,
            fromMonth,
            toMonth,
            fileName: downloadName,
            storedName: safeFile,
            url: `/${UPLOAD_DIR}/${safeFile}`,
            rowCount: records.length,
            createdAt,
            createdBy: actor._id != null ? String(actor._id) : '',
            createdByName: actor.name ?? '',
        };
        const result = await db.collection(COLLECTION).insertOne(insert);

        await logAuditAction({
            entity: 'cashflow',
            entityId: cashflowId,
            action: 'create',
            userId: insert.createdBy,
            userName: insert.createdByName,
            userRole: actor.role ?? '',
            description: `Экспорт кешфлоу ${employeeName} за ${fromMonth}–${toMonth} (${records.length} записей)`,
            metadata: { retainedFrom: `${fromMonth}:${toMonth}` },
        });

        return NextResponse.json({
            success: true,
            export: serializeExport({ ...insert, _id: result.insertedId }),
        });
    } catch (error) {
        console.error('Error in POST /api/accountancy/cashflow-exports:', error);
        return NextResponse.json({ success: false, message: 'Не удалось сформировать файл' }, { status: 500 });
    }
}

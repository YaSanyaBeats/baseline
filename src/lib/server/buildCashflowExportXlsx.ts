import ExcelJS from 'exceljs';
import type { Expense, Income } from '@/lib/types';
import {
    getEffectiveReportAmount,
    getExpenseSum,
    getIncomeSum,
} from '@/lib/accountancyUtils';
import { roundAccountancyAmount } from '@/lib/accountancyOverviewSyntheticFill';
import { formatSourceRecipientLabel } from '@/lib/formatSourceRecipientLabel';
import { resolveDistrictForObjectId } from '@/lib/sourceRecipientDistrictFunds';

export function ledgerMonthFromRecord(
    date: Date | string | undefined | null,
    reportMonth?: string | null,
): string {
    const rm = (reportMonth ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(rm)) return rm;
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function isMonthInRange(monthKey: string, fromMonth: string, toMonth: string): boolean {
    return Boolean(monthKey) && monthKey >= fromMonth && monthKey <= toMonth;
}

type LabelLookups = {
    objects: {
        id: number;
        name: string;
        propertyId?: number;
        district?: string;
        roomTypes: { id: number; name: string; nameEn?: string | null }[];
    }[];
    counterparties: { _id: string; name: string }[];
    usersWithCashflow: { _id: string; name: string }[];
    cashflows: { _id: string; name: string }[];
};

function formatDateCell(value: Date | string | undefined | null): string {
    if (!value) return '';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function objectName(objects: LabelLookups['objects'], objectId: number): string {
    const obj = objects.find((o) => o.id === objectId || o.propertyId === objectId);
    return (obj?.name ?? '').trim();
}

function labelParty(
    value: string | undefined,
    lookups: LabelLookups,
): string {
    const raw = (value ?? '').trim();
    if (!raw) return '';
    return formatSourceRecipientLabel(
        raw,
        lookups.objects,
        lookups.counterparties,
        lookups.usersWithCashflow,
        lookups.cashflows,
        'Комната из брони',
        undefined,
        undefined,
        undefined,
        undefined,
        'ru',
    );
}

type ExportRecord = {
    type: 'expense' | 'income';
    doc: Expense | Income;
};

export async function buildCashflowExportXlsxBuffer(
    records: ExportRecord[],
    lookups: LabelLookups,
): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Baseline';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Кешфлоу', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
        { header: 'Тип', key: 'type', width: 12 },
        { header: 'Дата', key: 'date', width: 12 },
        { header: 'Месяц отчёта', key: 'reportMonth', width: 14 },
        { header: 'Объект', key: 'object', width: 28 },
        { header: 'Комната', key: 'room', width: 22 },
        { header: 'Район', key: 'district', width: 16 },
        { header: 'Категория', key: 'category', width: 28 },
        { header: 'Источник', key: 'source', width: 28 },
        { header: 'Получатель', key: 'recipient', width: 28 },
        { header: 'Комментарий', key: 'comment', width: 36 },
        { header: 'Кол-во', key: 'quantity', width: 10 },
        { header: 'Цена', key: 'unitAmount', width: 12 },
        { header: 'Сумма', key: 'amount', width: 14 },
        { header: 'Сумма для отчёта', key: 'reportAmount', width: 18 },
        { header: 'Дельта', key: 'delta', width: 12 },
        { header: 'Статус', key: 'status', width: 14 },
        { header: 'ID брони', key: 'bookingId', width: 12 },
        { header: 'ID записи', key: 'id', width: 26 },
    ];

    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle' };

    const sorted = [...records].sort((a, b) => {
        const da = new Date(a.doc.date).getTime();
        const db = new Date(b.doc.date).getTime();
        return db - da;
    });

    for (const rec of sorted) {
        const doc = rec.doc;
        const signed =
            rec.type === 'expense' ? -getExpenseSum(doc as Expense) : getIncomeSum(doc as Income);
        const reportAmount = getEffectiveReportAmount(signed, doc.reportAmount);
        const delta = roundAccountancyAmount(signed - reportAmount);
        sheet.addRow({
            type: rec.type === 'expense' ? 'Расход' : 'Доход',
            date: formatDateCell(doc.date),
            reportMonth: ledgerMonthFromRecord(doc.date, doc.reportMonth),
            object: objectName(lookups.objects, doc.objectId),
            room: (doc.roomName ?? '').trim(),
            district: resolveDistrictForObjectId(lookups.objects, doc.objectId) ?? '',
            category: doc.category ?? '',
            source: labelParty(doc.source, lookups),
            recipient: labelParty(doc.recipient, lookups),
            comment: (doc.comment ?? '').trim(),
            quantity: doc.quantity ?? 1,
            unitAmount: roundAccountancyAmount(doc.amount ?? 0),
            amount: roundAccountancyAmount(signed),
            reportAmount: roundAccountancyAmount(reportAmount),
            delta,
            status: doc.status === 'confirmed' ? 'Подтверждён' : 'Черновик',
            bookingId: doc.bookingId ?? '',
            id: doc._id != null ? String(doc._id) : '',
        });
    }

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
}

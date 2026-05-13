import type { BookingCommissionResult } from '@/lib/commissionCalculation';
import { isCoAgentCommission, isOtaCommission } from '@/lib/commissionCalculation';
import type { Booking, Expense, Income } from '@/lib/types';

export const COMMISSION_OWNER_VIEW_KEY = 'accountancy-commission-owner-view-v1';

export type CommissionOwnerViewExpenseLine = {
    key: string;
    bookingId: number | null;
    date: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    agencyFlag: boolean;
};

export type CommissionOwnerViewBookingRow = {
    bookingId: number;
    arrival: string;
    departure: string;
    guestName: string;
    guestCountLabel: string;
    referrer: string;
    nights: number;
    income: number;
    otaCoAgent: number;
    commission: number;
};

export type CommissionOwnerViewUnlinkedIncomeLine = {
    key: string;
    date: string;
    description: string;
    lineTotal: number;
};

export type CommissionOwnerViewStoredPayload = {
    v: 1;
    reportTitle: string;
    monthKey: string;
    language: string;
    bookings: CommissionOwnerViewBookingRow[];
    expenseLines: CommissionOwnerViewExpenseLine[];
    unlinkedIncomeLines: CommissionOwnerViewUnlinkedIncomeLine[];
    totals: {
        totalIncome: number;
        totalExpenses: number;
        totalCommission: number;
    };
};

export interface CommissionPageResultForOwner {
    reportTitle: string;
    monthKey: string;
    bookingsReport: Array<{
        booking: Booking;
        calculation: BookingCommissionResult;
        expenses: Expense[];
    }>;
    unlinkedExpenses: Expense[];
    unlinkedIncomes: Income[];
    totalIncome: number;
    totalExpenses: number;
    totalCommission: number;
}

function guestCountLabel(b: Booking): string {
    const a = b.numAdult;
    const c = b.numChild;
    if (a == null && c == null) return '—';
    return String((a ?? 0) + (c ?? 0));
}

function guestDisplayName(b: Booking): string {
    const name = [b.firstName, b.lastName].filter(Boolean).join(' ').trim();
    if (name) return name;
    if (b.title && String(b.title).trim()) return String(b.title).trim();
    return `#${b.id}`;
}

function expenseLineKey(bookingId: number | null, e: Expense, line: number): string {
    return e._id ?? `${bookingId ?? 'u'}-${String(e.date)}-${e.category}-${line}`;
}

function toIsoDateString(d: Date | string): string {
    const date = new Date(d);
    return Number.isNaN(date.getTime()) ? String(d) : date.toISOString();
}

export function buildCommissionOwnerViewPayload(
    result: CommissionPageResultForOwner,
    language: string
): CommissionOwnerViewStoredPayload {
    const bookings: CommissionOwnerViewBookingRow[] = result.bookingsReport.map(({ booking, calculation }) => ({
        bookingId: booking.id,
        arrival: booking.arrival,
        departure: booking.departure,
        guestName: guestDisplayName(booking),
        guestCountLabel: guestCountLabel(booking),
        referrer: booking.refererEditable || booking.referer || booking.channel || '—',
        nights: calculation.nights,
        income: calculation.income,
        otaCoAgent: calculation.otaCoAgentExpenses,
        commission: calculation.commission,
    }));

    const expenseLines: CommissionOwnerViewExpenseLine[] = [];

    for (const { booking, expenses: expRows } of result.bookingsReport) {
        for (const e of expRows) {
            const qty = e.quantity ?? 1;
            const unit = e.amount ?? 0;
            const line = qty * unit;
            expenseLines.push({
                key: expenseLineKey(booking.id, e, line),
                bookingId: booking.id,
                date: toIsoDateString(e.date as Date | string),
                description: e.comment ? `${e.category} (${e.comment})` : e.category,
                quantity: qty,
                unitPrice: unit,
                lineTotal: line,
                agencyFlag: isOtaCommission(e.category) || isCoAgentCommission(e.category),
            });
        }
    }

    for (const e of result.unlinkedExpenses) {
        const qty = e.quantity ?? 1;
        const unit = e.amount ?? 0;
        const line = qty * unit;
        expenseLines.push({
            key: expenseLineKey(null, e, line),
            bookingId: null,
            date: toIsoDateString(e.date as Date | string),
            description: e.comment ? `${e.category} (${e.comment})` : e.category,
            quantity: qty,
            unitPrice: unit,
            lineTotal: line,
            agencyFlag: isOtaCommission(e.category) || isCoAgentCommission(e.category),
        });
    }

    const unlinkedIncomeLines: CommissionOwnerViewUnlinkedIncomeLine[] = result.unlinkedIncomes.map((i) => {
        const line = (i.quantity ?? 1) * (i.amount ?? 0);
        return {
            key: i._id ?? `ui-${String(i.date)}-${i.category}-${line}`,
            date: toIsoDateString(i.date as Date | string),
            description: i.comment ? `${i.category} (${i.comment})` : i.category,
            lineTotal: line,
        };
    });

    return {
        v: 1,
        reportTitle: result.reportTitle,
        monthKey: result.monthKey,
        language,
        bookings,
        expenseLines,
        unlinkedIncomeLines,
        totals: {
            totalIncome: result.totalIncome,
            totalExpenses: result.totalExpenses,
            totalCommission: result.totalCommission,
        },
    };
}

export function parseCommissionOwnerViewPayload(raw: string | null): CommissionOwnerViewStoredPayload | null {
    if (raw == null || raw === '') return null;
    try {
        const parsed = JSON.parse(raw) as CommissionOwnerViewStoredPayload;
        if (parsed?.v !== 1 || !Array.isArray(parsed.bookings) || !Array.isArray(parsed.expenseLines)) return null;
        return parsed;
    } catch {
        return null;
    }
}

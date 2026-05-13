'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Alert,
    Box,
    Button,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from '@/i18n/useTranslation';
import { useUser } from '@/providers/UserProvider';
import {
    COMMISSION_OWNER_VIEW_KEY,
    parseCommissionOwnerViewPayload,
    type CommissionOwnerViewStoredPayload,
} from '@/lib/commissionOwnerView';

function formatAmount(value: number, locale: string): string {
    return value.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatDateShort(iso: string, locale: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function monthLastDayIso(monthKey: string): string {
    const [y, m] = monthKey.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return `${monthKey}-28`;
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

function rowProfit(income: number, ota: number, commission: number): number {
    return income - ota - commission;
}

export default function OwnerViewPage() {
    const { t, language } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const [payload, setPayload] = useState<CommissionOwnerViewStoredPayload | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const raw = sessionStorage.getItem(COMMISSION_OWNER_VIEW_KEY);
        setPayload(parseCommissionOwnerViewPayload(raw));
    }, []);

    const hasAccess = isAdmin || isAccountant;
    const locale = useMemo(
        () => (payload?.language === 'en-US' ? 'en-US' : language === 'en' ? 'en-US' : 'ru-RU'),
        [payload?.language, language]
    );

    const incomeTotals = useMemo(() => {
        if (!payload) return null;
        let sumIncome = 0;
        let sumOta = 0;
        let sumCommission = 0;
        let sumProfit = 0;
        let sum70 = 0;
        let sum30 = 0;
        let sumUnlinked = 0;
        for (const b of payload.bookings) {
            sumIncome += b.income;
            sumOta += b.otaCoAgent;
            sumCommission += b.commission;
            sumProfit += rowProfit(b.income, b.otaCoAgent, b.commission);
            sum70 += b.income * 0.7;
            sum30 += b.income * 0.3;
        }
        for (const u of payload.unlinkedIncomeLines) {
            sumUnlinked += u.lineTotal;
        }
        sumIncome += sumUnlinked;
        sumProfit += sumUnlinked;
        sum70 += sumUnlinked * 0.7;
        sum30 += sumUnlinked * 0.3;
        return { sumIncome, sumOta, sumCommission, sumProfit, sum70, sum30, sumUnlinked };
    }, [payload]);

    const expenseSum = useMemo(() => {
        if (!payload) return 0;
        return payload.expenseLines.reduce((s, r) => s + r.lineTotal, 0);
    }, [payload]);

    const earningsNet = useMemo(() => {
        if (!payload) return 0;
        return payload.totals.totalIncome - payload.totals.totalExpenses - payload.totals.totalCommission;
    }, [payload]);

    const settlementsExpenseTotal = useMemo(
        () => (payload ? payload.totals.totalExpenses + payload.totals.totalCommission : 0),
        [payload]
    );

    const settlementRows = useMemo(() => {
        if (!payload) return [];
        const monthStart = `${payload.monthKey}-01`;
        const monthEnd = monthLastDayIso(payload.monthKey);
        const opening = 0;
        const afterIncome = opening + payload.totals.totalIncome;
        const afterExpenses = afterIncome - settlementsExpenseTotal;
        return [
            { date: monthStart, reasonKey: 'settlementOpening' as const, amount: opening, balance: opening },
            {
                date: monthStart,
                reasonKey: 'settlementIncomeMonth' as const,
                amount: payload.totals.totalIncome,
                balance: afterIncome,
            },
            {
                date: monthEnd,
                reasonKey: 'settlementExpensesAndCommission' as const,
                amount: -settlementsExpenseTotal,
                balance: afterExpenses,
            },
            {
                date: monthEnd,
                reasonKey: 'settlementClosing' as const,
                amount: afterExpenses,
                balance: afterExpenses,
            },
        ];
    }, [payload, settlementsExpenseTotal]);

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.commission.ownerViewTitle')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    if (!payload) {
        return (
            <Box>
                <Box sx={{ mb: 2 }}>
                    <Link href="/dashboard/accountancy/commission">
                        <Button variant="text" startIcon={<ArrowBackIcon />}>
                            {t('common.back')}
                        </Button>
                    </Link>
                </Box>
                <Alert severity="info">{t('accountancy.commission.ownerViewNoData')}</Alert>
            </Box>
        );
    }

    const headCellSx = (bg: string, color?: string) => ({
        bgcolor: bg,
        color: color ?? 'common.white',
        fontWeight: 700,
        whiteSpace: 'nowrap',
    });

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy/commission">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('accountancy.commission.ownerViewBackToCommission')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 1 }}>
                {t('accountancy.commission.ownerViewTitle')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {payload.reportTitle} · {payload.monthKey}
            </Typography>

            <Stack spacing={3}>
                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Typography variant="subtitle1" sx={{ ...headCellSx('success.main'), px: 2, py: 1 }}>
                        {t('accountancy.commission.ownerTableIncomes')}
                    </Typography>
                    <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={headCellSx('success.dark')}>
                                        {t('accountancy.commission.ownerColArrival')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')}>
                                        {t('accountancy.commission.ownerColDeparture')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')} align="right">
                                        {t('accountancy.commission.ownerColNights')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')}>
                                        {t('accountancy.commission.ownerColGuestName')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')} align="right">
                                        {t('accountancy.commission.ownerColGuests')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')}>
                                        {t('accountancy.commission.ownerColReferrer')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')} align="right">
                                        {t('accountancy.commission.ownerColBookingAmount')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')} align="right">
                                        {t('accountancy.commission.ownerColOtaCoAgent')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')} align="right">
                                        {t('accountancy.commission.ownerColAgencyCommission')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')} align="right">
                                        {t('accountancy.commission.ownerColProfit')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')} align="right">
                                        {t('accountancy.commission.ownerColShare70')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('success.dark')} align="right">
                                        {t('accountancy.commission.ownerColShare30')}
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {payload.bookings.map((b) => (
                                    <TableRow key={b.bookingId}>
                                        <TableCell>{formatDateShort(b.arrival, locale)}</TableCell>
                                        <TableCell>{formatDateShort(b.departure, locale)}</TableCell>
                                        <TableCell align="right">{b.nights}</TableCell>
                                        <TableCell>{b.guestName}</TableCell>
                                        <TableCell align="right">{b.guestCountLabel}</TableCell>
                                        <TableCell>{b.referrer}</TableCell>
                                        <TableCell align="right">{formatAmount(b.income, locale)}</TableCell>
                                        <TableCell align="right">{formatAmount(b.otaCoAgent, locale)}</TableCell>
                                        <TableCell align="right">{formatAmount(b.commission, locale)}</TableCell>
                                        <TableCell align="right">
                                            {formatAmount(rowProfit(b.income, b.otaCoAgent, b.commission), locale)}
                                        </TableCell>
                                        <TableCell align="right">{formatAmount(b.income * 0.7, locale)}</TableCell>
                                        <TableCell align="right">{formatAmount(b.income * 0.3, locale)}</TableCell>
                                    </TableRow>
                                ))}
                                {payload.unlinkedIncomeLines.map((u) => (
                                    <TableRow key={u.key}>
                                        <TableCell>{formatDateShort(u.date, locale)}</TableCell>
                                        <TableCell>—</TableCell>
                                        <TableCell align="right">—</TableCell>
                                        <TableCell>—</TableCell>
                                        <TableCell align="right">—</TableCell>
                                        <TableCell>—</TableCell>
                                        <TableCell align="right">{formatAmount(u.lineTotal, locale)}</TableCell>
                                        <TableCell align="right">{formatAmount(0, locale)}</TableCell>
                                        <TableCell align="right">{formatAmount(0, locale)}</TableCell>
                                        <TableCell align="right">{formatAmount(u.lineTotal, locale)}</TableCell>
                                        <TableCell align="right">{formatAmount(u.lineTotal * 0.7, locale)}</TableCell>
                                        <TableCell align="right">{formatAmount(u.lineTotal * 0.3, locale)}</TableCell>
                                    </TableRow>
                                ))}
                                {incomeTotals && (
                                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                                        <TableCell colSpan={6} align="right" sx={{ fontWeight: 700 }}>
                                            {t('accountancy.commission.ownerTotalIncomes')}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {formatAmount(incomeTotals.sumIncome, locale)}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {formatAmount(incomeTotals.sumOta, locale)}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {formatAmount(incomeTotals.sumCommission, locale)}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {formatAmount(incomeTotals.sumProfit, locale)}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {formatAmount(incomeTotals.sum70, locale)}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {formatAmount(incomeTotals.sum30, locale)}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>

                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Typography variant="subtitle1" sx={{ ...headCellSx('warning.dark'), px: 2, py: 1 }}>
                        {t('accountancy.commission.ownerTableExpenses')}
                    </Typography>
                    <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={headCellSx('warning.main', 'common.black')}>
                                        {t('accountancy.commission.ownerColDescription')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                        {t('accountancy.quantity')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                        {t('accountancy.commission.ownerColPriceThb')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                        {t('accountancy.commission.ownerColSumThb')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                        {t('accountancy.commission.ownerColExpenseThb')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                        {t('accountancy.commission.ownerColAgencyExpenses')}
                                    </TableCell>
                                    <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                        {t('accountancy.commission.ownerColGuestExpenses')}
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {payload.expenseLines.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7}>
                                            <Typography variant="body2" color="text.secondary">
                                                {t('accountancy.noExpenses')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    payload.expenseLines.map((row) => (
                                        <TableRow
                                            key={row.key}
                                            sx={row.agencyFlag ? { bgcolor: 'warning.50' } : undefined}
                                        >
                                            <TableCell>{row.description}</TableCell>
                                            <TableCell align="right">{row.quantity}</TableCell>
                                            <TableCell align="right">{formatAmount(row.unitPrice, locale)}</TableCell>
                                            <TableCell align="right">{formatAmount(row.lineTotal, locale)}</TableCell>
                                            <TableCell align="right">{formatAmount(-row.lineTotal, locale)}</TableCell>
                                            <TableCell align="right">
                                                {row.agencyFlag ? formatAmount(row.lineTotal, locale) : '—'}
                                            </TableCell>
                                            <TableCell align="right">—</TableCell>
                                        </TableRow>
                                    ))
                                )}
                                {payload.expenseLines.length > 0 && (
                                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                                        <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>
                                            {t('accountancy.commission.ownerTotalExpenses')}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {formatAmount(-expenseSum, locale)}
                                        </TableCell>
                                        <TableCell colSpan={2} />
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>

                <Paper variant="outlined" sx={{ overflow: 'hidden', maxWidth: 480 }}>
                    <Typography variant="subtitle1" sx={{ ...headCellSx('info.dark'), px: 2, py: 1 }}>
                        {t('accountancy.commission.ownerTableEarnings')}
                    </Typography>
                    <Table size="small">
                        <TableBody>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 600 }}>
                                    {t('accountancy.commission.ownerEarningsRowIncomes')}
                                </TableCell>
                                <TableCell align="right">{formatAmount(payload.totals.totalIncome, locale)}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 600 }}>
                                    {t('accountancy.commission.ownerEarningsRowExpenses')}
                                </TableCell>
                                <TableCell align="right">
                                    {formatAmount(-settlementsExpenseTotal, locale)}
                                </TableCell>
                            </TableRow>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell sx={{ fontWeight: 700 }}>
                                    {t('accountancy.commission.ownerEarningsRowTotal')}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatAmount(earningsNet, locale)}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Paper>

                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Typography variant="subtitle1" sx={{ ...headCellSx('warning.light', 'common.black'), px: 2, py: 1 }}>
                        {t('accountancy.commission.ownerTableSettlements')}
                    </Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('accountancy.dateColumn')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>
                                        {t('accountancy.commission.ownerColReason')}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                        {t('accountancy.commission.ownerColAmountThb')}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                        {t('accountancy.commission.ownerColBalance')}
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {settlementRows.map((row, idx) => (
                                    <TableRow key={`${row.reasonKey}-${idx}`}>
                                        <TableCell>
                                            {formatDateShort(
                                                row.date.includes('T') ? row.date : `${row.date}T12:00:00`,
                                                locale
                                            )}
                                        </TableCell>
                                        <TableCell>{t(`accountancy.commission.${row.reasonKey}`)}</TableCell>
                                        <TableCell align="right">{formatAmount(row.amount, locale)}</TableCell>
                                        <TableCell align="right">{formatAmount(row.balance, locale)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            </Stack>
        </Box>
    );
}

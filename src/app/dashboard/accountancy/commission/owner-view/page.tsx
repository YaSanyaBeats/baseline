'use client';

import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    CircularProgress,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from '@/i18n/useTranslation';
import { useUser } from '@/providers/UserProvider';
import { useObjects } from '@/providers/ObjectsProvider';
import { loadCommissionOwnerViewPayload } from '@/lib/commissionOwnerViewLoader';
import {
    type CommissionOwnerViewExpenseGroup,
    type CommissionOwnerViewRoomSection,
    type CommissionOwnerViewStoredPayload,
} from '@/lib/commissionOwnerView';
import {
    sumOwnerViewExpenseColumnSigned,
    sumOwnerViewExpenseTableSignedTotal,
    ownerViewExpenseColumnValue,
    type CommissionOwnerViewExpenseLine,
} from '@/lib/ownerViewExpenses';

function formatAmount(value: number, locale: string): string {
    return value.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatExpenseCell(
    row: CommissionOwnerViewExpenseLine,
    column: 'expense' | 'agency' | 'guest',
    locale: string
): string {
    const value = ownerViewExpenseColumnValue(row, column);
    return value == null ? '—' : formatAmount(value, locale);
}

/** Знак и цвет колонки «Расход»: приход + (зелёный), расход − (красный). */
function getExpenseColumnSignedValue(row: CommissionOwnerViewExpenseLine): number | null {
    return ownerViewExpenseColumnValue(row, 'expense');
}

function formatSignedAmount(value: number, locale: string): string {
    const sign = value >= 0 ? '+' : '−';
    return `${sign}${formatAmount(Math.abs(value), locale)}`;
}

function signedAmountColor(value: number): 'success.main' | 'error.main' {
    return value >= 0 ? 'success.main' : 'error.main';
}

function SignedAmountValue({ value, locale }: { value: number | null; locale: string }) {
    if (value == null) {
        return (
            <Typography component="span" color="text.secondary">
                —
            </Typography>
        );
    }
    return (
        <Typography component="span" sx={{ color: signedAmountColor(value), fontWeight: 500 }}>
            {formatSignedAmount(value, locale)}
        </Typography>
    );
}

function ExpenseColumnValue({
    row,
    locale,
}: {
    row: CommissionOwnerViewExpenseLine;
    locale: string;
}) {
    const signed = getExpenseColumnSignedValue(row);
    if (signed == null) {
        return (
            <Typography component="span" color="text.secondary">
                —
            </Typography>
        );
    }
    return (
        <Typography component="span" sx={{ color: signedAmountColor(signed), fontWeight: 500 }}>
            {formatSignedAmount(signed, locale)}
        </Typography>
    );
}

function formatDateShort(iso: string, locale: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function computeIncomeTotal(rows: CommissionOwnerViewRoomSection['incomeRows']): number {
    return rows.reduce((s, r) => s + r.income, 0);
}

function isNonZeroAmount(value: number): boolean {
    return value !== 0;
}

type HeadCellSx = (bg: string, color?: string) => Record<string, unknown>;

function RoomIncomesTable({
    section,
    locale,
    t,
    headCellSx,
}: {
    section: CommissionOwnerViewRoomSection;
    locale: string;
    t: (key: string) => string;
    headCellSx: HeadCellSx;
}) {
    const visibleRows = section.incomeRows.filter((r) => isNonZeroAmount(r.income));
    const incomeTotal = computeIncomeTotal(visibleRows);
    const hasRows = visibleRows.length > 0;

    return (
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
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {!hasRows ? (
                            <TableRow>
                                <TableCell colSpan={7}>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('accountancy.commission.noIncomes')}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {visibleRows.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{formatDateShort(row.arrival, locale)}</TableCell>
                                <TableCell>{formatDateShort(row.departure, locale)}</TableCell>
                                <TableCell align="right">{row.nights}</TableCell>
                                <TableCell>{row.guestName}</TableCell>
                                <TableCell align="right">{row.guestCountLabel}</TableCell>
                                <TableCell>{row.referrer}</TableCell>
                                <TableCell align="right">{formatAmount(row.income, locale)}</TableCell>
                            </TableRow>
                        ))}
                        {hasRows && (
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell colSpan={6} align="right" sx={{ fontWeight: 700 }}>
                                    {t('accountancy.commission.ownerTotalIncomes')}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatAmount(incomeTotal, locale)}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
}

function RoomExpensesTable({
    section,
    locale,
    t,
    headCellSx,
}: {
    section: CommissionOwnerViewRoomSection;
    locale: string;
    t: (key: string) => string;
    headCellSx: HeadCellSx;
}) {
    const expenseColumnTotal = sumOwnerViewExpenseTableSignedTotal(section.expenseGroups);
    const agencyExpenseColumnTotal = sumOwnerViewExpenseColumnSigned(section.expenseGroups, 'agency');
    const guestColumnTotal = sumOwnerViewExpenseColumnSigned(section.expenseGroups, 'guest');
    const hasRows = section.expenseGroups.some((g) => g.lines.length > 0);

    const groupLabel = (group: CommissionOwnerViewExpenseGroup) =>
        group.kind === 'booking' ? group.label : t(group.labelI18nKey ?? '');

    return (
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
                        {!hasRows ? (
                            <TableRow>
                                <TableCell colSpan={7}>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('accountancy.noExpenses')}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            section.expenseGroups.map((group) => (
                                <Fragment key={group.key}>
                                    <TableRow sx={{ bgcolor: 'action.selected' }}>
                                        <TableCell colSpan={7} sx={{ fontWeight: 700 }}>
                                            {groupLabel(group)}
                                        </TableCell>
                                    </TableRow>
                                    {group.lines.map((row) => (
                                        <TableRow
                                            key={row.key}
                                            sx={row.isAgency ? { bgcolor: 'warning.50' } : undefined}
                                        >
                                            <TableCell>{row.description}</TableCell>
                                            <TableCell align="right">{row.quantity}</TableCell>
                                            <TableCell align="right">{formatAmount(row.unitPrice, locale)}</TableCell>
                                            <TableCell align="right">{formatAmount(row.lineTotal, locale)}</TableCell>
                                            <TableCell align="right">
                                                <ExpenseColumnValue row={row} locale={locale} />
                                            </TableCell>
                                            <TableCell align="right">
                                                <SignedAmountValue
                                                    value={ownerViewExpenseColumnValue(row, 'agency')}
                                                    locale={locale}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <SignedAmountValue
                                                    value={ownerViewExpenseColumnValue(row, 'guest')}
                                                    locale={locale}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </Fragment>
                            ))
                        )}
                        {hasRows && (
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>
                                    {t('accountancy.commission.ownerTotalExpenses')}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    sx={{
                                        fontWeight: 700,
                                        color: signedAmountColor(expenseColumnTotal),
                                    }}
                                >
                                    {formatSignedAmount(expenseColumnTotal, locale)}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    <Typography
                                        component="span"
                                        sx={{ color: signedAmountColor(agencyExpenseColumnTotal), fontWeight: 700 }}
                                    >
                                        {formatSignedAmount(agencyExpenseColumnTotal, locale)}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    <Typography
                                        component="span"
                                        sx={{ color: signedAmountColor(guestColumnTotal), fontWeight: 700 }}
                                    >
                                        {formatSignedAmount(guestColumnTotal, locale)}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
}

function RoomEarningsTable({
    section,
    locale,
    t,
    headCellSx,
}: {
    section: CommissionOwnerViewRoomSection;
    locale: string;
    t: (key: string) => string;
    headCellSx: HeadCellSx;
}) {
    const expenseColumnTotal = sumOwnerViewExpenseTableSignedTotal(section.expenseGroups);
    const earningsNet = section.totals.totalIncome + expenseColumnTotal;

    return (
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
                        <TableCell align="right">{formatAmount(section.totals.totalIncome, locale)}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>
                            {t('accountancy.commission.ownerEarningsRowExpenses')}
                        </TableCell>
                        <TableCell align="right">
                            {formatAmount(-expenseColumnTotal, locale)}
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
    );
}

function OwnerViewBackLink({ label }: { label: string }) {
    return (
        <Box sx={{ mb: 2 }}>
            <Link href="/dashboard/accountancy/commission">
                <Button variant="text" startIcon={<ArrowBackIcon />}>
                    {label}
                </Button>
            </Link>
        </Box>
    );
}

function OwnerViewPageContent() {
    const searchParams = useSearchParams();
    const { t, language } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();

    const ownerId = searchParams.get('ownerId') ?? '';
    const monthKey = searchParams.get('month') ?? '';

    const [payload, setPayload] = useState<CommissionOwnerViewStoredPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);

    const locale = language === 'en' ? 'en-US' : 'ru-RU';
    const hasAccess = isAdmin || isAccountant;
    const hasParams = Boolean(ownerId && monthKey);

    useEffect(() => {
        if (!hasAccess || !hasParams) {
            setPayload(null);
            setLoadFailed(false);
            setLoading(false);
            return;
        }

        let cancelled = false;

        const run = async () => {
            setLoading(true);
            setLoadFailed(false);
            setPayload(null);
            try {
                const next = await loadCommissionOwnerViewPayload({
                    ownerId,
                    monthKey,
                    locale,
                    objects,
                });
                if (cancelled) return;
                if (!next) {
                    setLoadFailed(true);
                    return;
                }
                setPayload(next);
            } catch (err) {
                console.error('Owner view load error:', err);
                if (!cancelled) setLoadFailed(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [hasAccess, hasParams, ownerId, monthKey, locale, objects]);

    const displayLocale = useMemo(
        () => (payload?.language === 'en-US' ? 'en-US' : locale),
        [payload?.language, locale]
    );

    const headCellSx: HeadCellSx = (bg, color) => ({
        bgcolor: bg,
        color: color ?? 'common.white',
        fontWeight: 700,
        whiteSpace: 'nowrap',
    });

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

    if (!hasParams) {
        return (
            <Box>
                <OwnerViewBackLink label={t('common.back')} />
                <Alert severity="info">{t('accountancy.commission.ownerViewNoData')}</Alert>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box>
                <OwnerViewBackLink label={t('accountancy.commission.ownerViewBackToCommission')} />
                <Stack direction="row" spacing={2} alignItems="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                    <Typography color="text.secondary">
                        {t('accountancy.commission.ownerViewLoading')}
                    </Typography>
                </Stack>
            </Box>
        );
    }

    if (loadFailed || !payload) {
        return (
            <Box>
                <OwnerViewBackLink label={t('accountancy.commission.ownerViewBackToCommission')} />
                <Alert severity="warning">{t('accountancy.commission.ownerViewLoadError')}</Alert>
            </Box>
        );
    }

    return (
        <Box>
            <OwnerViewBackLink label={t('accountancy.commission.ownerViewBackToCommission')} />

            <Typography variant="h4" sx={{ mb: 1 }}>
                {t('accountancy.commission.ownerViewTitle')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {payload.reportTitle} · {payload.monthKey}
            </Typography>

            <Stack spacing={3}>
                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Typography
                        variant="subtitle1"
                        sx={{ ...headCellSx('warning.light', 'common.black'), px: 2, py: 1 }}
                    >
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
                                {payload.settlementRows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4}>
                                            <Typography variant="body2" color="text.secondary">
                                                {t('accountancy.commission.ownerNoSettlements')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    payload.settlementRows.map((row) => (
                                        <TableRow key={row.key}>
                                            <TableCell>
                                                {formatDateShort(
                                                    row.date.includes('T') ? row.date : `${row.date}T12:00:00`,
                                                    displayLocale
                                                )}
                                            </TableCell>
                                            <TableCell>{row.description}</TableCell>
                                            <TableCell align="right">
                                                {formatAmount(row.amount, displayLocale)}
                                            </TableCell>
                                            <TableCell align="right">
                                                {formatAmount(row.balance, displayLocale)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>

                {payload.roomSections.length === 0 ? (
                    <Alert severity="info">{t('accountancy.commission.noBookings')}</Alert>
                ) : (
                    payload.roomSections.map((section, index) => (
                        <Accordion
                            key={section.key}
                            defaultExpanded={index === 0}
                            elevation={0}
                            variant="outlined"
                            sx={{ '&:before': { display: 'none' } }}
                        >
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Typography fontWeight={700}>{section.title}</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Stack spacing={3}>
                                    <RoomIncomesTable
                                        section={section}
                                        locale={displayLocale}
                                        t={t}
                                        headCellSx={headCellSx}
                                    />
                                    <RoomExpensesTable
                                        section={section}
                                        locale={displayLocale}
                                        t={t}
                                        headCellSx={headCellSx}
                                    />
                                    <RoomEarningsTable
                                        section={section}
                                        locale={displayLocale}
                                        t={t}
                                        headCellSx={headCellSx}
                                    />
                                </Stack>
                            </AccordionDetails>
                        </Accordion>
                    ))
                )}
            </Stack>
        </Box>
    );
}

export default function OwnerViewPage() {
    return (
        <Suspense
            fallback={
                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                    <CircularProgress />
                </Box>
            }
        >
            <OwnerViewPageContent />
        </Suspense>
    );
}

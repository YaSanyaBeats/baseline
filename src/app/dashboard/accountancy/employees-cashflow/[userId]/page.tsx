'use client';

import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Booking, Expense, Income } from '@/lib/types';
import { getExpenses } from '@/lib/expenses';
import { getIncomes } from '@/lib/incomes';
import { getCashflows } from '@/lib/cashflows';
import { getExpenseSum, getIncomeSum } from '@/lib/accountancyUtils';
import { getBookingsByIds } from '@/lib/bookings';
import { getCounterparties } from '@/lib/counterparties';
import { getUsersWithCashflow } from '@/lib/users';
import { formatSourceRecipientLabel } from '@/components/accountancy/SourceRecipientSelect';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';

type RecordRow = {
    _id: string;
    type: 'expense' | 'income';
    date: Date | string;
    category: string;
    amount: number;
    bookingId?: number;
    source?: string;
    recipient?: string;
    recipientLabel: string;
    monthKey: string;
    monthLabel: string;
};

type MonthGroup = {
    monthKey: string;
    monthLabel: string;
    rows: RecordRow[];
    balance: number;
};

function monthKeyFromRecord(date: Date | string, reportMonth?: string | null): string {
    const rm = (reportMonth ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(rm)) return rm;
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string, fallback: string): string {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return fallback;
    const [y, m] = monthKey.split('-');
    return `${Number(m)}.${y}`;
}

export default function Page() {
    const params = useParams();
    const userId = typeof params.userId === 'string' ? params.userId : '';
    const { t, language } = useTranslation();
    const { objects } = useObjects();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();

    const [userName, setUserName] = useState('');
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [usersWithCashflow, setUsersWithCashflow] = useState<{ _id: string; name: string }[]>([]);
    const [allCashflows, setAllCashflows] = useState<{ _id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [noCashflow, setNoCashflow] = useState(false);

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess || !userId) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const [cfList, cpList, usersCf] = await Promise.all([
                    getCashflows(),
                    getCounterparties(),
                    getUsersWithCashflow(),
                ]);
                if (cancelled) return;

                setAllCashflows(cfList.map((c) => ({ _id: c._id!, name: c.name })));
                setCounterparties(cpList.map((c) => ({ _id: c._id!, name: c.name })));
                setUsersWithCashflow(usersCf);

                const selectedUser = usersCf.find((u) => u._id === userId);
                setUserName(selectedUser?.name ?? userId);

                const userCf = cfList.find((cf) => cf.userId === userId);
                if (!userCf?._id) {
                    setNoCashflow(true);
                    setExpenses([]);
                    setIncomes([]);
                    setBookings([]);
                    return;
                }

                setNoCashflow(false);

                const [expList, incList] = await Promise.all([
                    getExpenses({ cashflowId: userCf._id }),
                    getIncomes({ cashflowId: userCf._id }),
                ]);
                if (cancelled) return;

                setExpenses(expList);
                setIncomes(incList);

                const bookingIds = Array.from(
                    new Set(
                        [...expList, ...incList]
                            .map((r) => r.bookingId)
                            .filter((id): id is number => typeof id === 'number'),
                    ),
                );
                if (bookingIds.length > 0) {
                    const bookingList = await getBookingsByIds(bookingIds);
                    if (!cancelled) setBookings(bookingList);
                } else {
                    setBookings([]);
                }
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setSnackbar({
                        open: true,
                        message: t('common.serverError'),
                        severity: 'error',
                    });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAccess, userId]);

    const bookingsById = useMemo(() => {
        const m = new Map<number, Booking>();
        bookings.forEach((b) => m.set(b.id, b));
        return m;
    }, [bookings]);

    const roomFromBookingLabel = t('accountancy.sourceRecipientRoomFromBooking');

    const labelSource = (value: string | undefined) =>
        formatSourceRecipientLabel(
            value,
            objects,
            counterparties,
            usersWithCashflow,
            allCashflows,
            roomFromBookingLabel,
            undefined,
            undefined,
            undefined,
            undefined,
            language,
        );

    const balance =
        incomes.reduce((s, i) => s + getIncomeSum(i), 0) -
        expenses.reduce((s, e) => s + getExpenseSum(e), 0);

    const noMonthLabel = t('accountancy.employeesCashflow.noMonth');

    const rows: RecordRow[] = useMemo(() => {
        const mapped: RecordRow[] = [
            ...expenses.map((e) => {
                const recipient = (e.recipient ?? '').trim();
                const monthKey = monthKeyFromRecord(e.date, e.reportMonth);
                return {
                    _id: e._id!,
                    type: 'expense' as const,
                    date: e.date,
                    category: e.category,
                    amount: -getExpenseSum(e),
                    bookingId: e.bookingId,
                    source: e.source,
                    recipient: e.recipient,
                    recipientLabel: recipient ? labelSource(e.recipient) : '—',
                    monthKey,
                    monthLabel: formatMonthLabel(monthKey, noMonthLabel),
                };
            }),
            ...incomes.map((i) => {
                const recipient = (i.recipient ?? '').trim();
                const monthKey = monthKeyFromRecord(i.date, i.reportMonth);
                return {
                    _id: i._id!,
                    type: 'income' as const,
                    date: i.date,
                    category: i.category,
                    amount: getIncomeSum(i),
                    bookingId: i.bookingId,
                    source: i.source,
                    recipient: i.recipient,
                    recipientLabel: recipient ? labelSource(i.recipient) : '—',
                    monthKey,
                    monthLabel: formatMonthLabel(monthKey, noMonthLabel),
                };
            }),
        ];
        return mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expenses, incomes, objects, counterparties, usersWithCashflow, allCashflows, language, t, noMonthLabel]);

    const groupedByMonth: MonthGroup[] = useMemo(() => {
        const byMonth = new Map<string, RecordRow[]>();
        const monthLabels = new Map<string, string>();

        for (const row of rows) {
            monthLabels.set(row.monthKey, row.monthLabel);
            const list = byMonth.get(row.monthKey) ?? [];
            list.push(row);
            byMonth.set(row.monthKey, list);
        }

        return Array.from(byMonth.entries())
            .map(([monthKey, monthRows]) => ({
                monthKey,
                monthLabel: monthLabels.get(monthKey) ?? formatMonthLabel(monthKey, noMonthLabel),
                rows: monthRows,
                balance: monthRows.reduce((s, r) => s + r.amount, 0),
            }))
            .sort((a, b) => {
                if (!a.monthKey && b.monthKey) return 1;
                if (a.monthKey && !b.monthKey) return -1;
                return b.monthKey.localeCompare(a.monthKey);
            });
    }, [rows, noMonthLabel]);

    const formatDate = (date: Date | string): string => {
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const formatAttachedBooking = (bookingId?: number): string => {
        if (bookingId == null) return '—';
        const b = bookingsById.get(bookingId);
        if (!b) return `#${bookingId}`;
        const parts = [
            (b.title || '').trim(),
            (b.firstName || '').trim(),
            (b.lastName || '').trim(),
            b.arrival ? formatDate(b.arrival) : '',
            b.departure ? formatDate(b.departure) : '',
        ].filter((p) => p.length > 0);
        return parts.length > 0 ? parts.join(' · ') : `#${bookingId}`;
    };

    const formatAmount = (value: number): string => {
        const fixed = Number(value).toFixed(2);
        const [intPart, decPart] = fixed.split('.');
        const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return `${value >= 0 ? '+' : ''}${withSpaces}.${decPart ?? '00'}`;
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.employeesCashflow.detailsTitle')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                <Link href="/dashboard/accountancy/employees-cashflow">
                    <Button startIcon={<ArrowBackIcon />} size="small">
                        {t('common.back')}
                    </Button>
                </Link>
                <Typography variant="h4">
                    {t('accountancy.employeesCashflow.detailsTitle')}: {userName}
                </Typography>
            </Box>

            {!loading && !noCashflow && (
                <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Typography
                        variant="h3"
                        sx={{ fontWeight: 700 }}
                        color={balance >= 0 ? 'success.main' : 'error.main'}
                    >
                        {formatAmount(balance)}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        {t('accountancy.myCashflowBalance')}
                    </Typography>
                </Box>
            )}

            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : noCashflow ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">
                        {t('accountancy.employeesCashflow.noCashflowLinked')}
                    </Typography>
                </Paper>
            ) : rows.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">{t('accountancy.myCashflowNoRecords')}</Typography>
                </Paper>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {groupedByMonth.map((monthGroup) => (
                        <Accordion key={monthGroup.monthKey || 'none'} defaultExpanded disableGutters>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 2,
                                        width: '100%',
                                        pr: 1,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        {monthGroup.monthLabel}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        fontWeight={600}
                                        color={monthGroup.balance >= 0 ? 'success.main' : 'error.main'}
                                    >
                                        {formatAmount(monthGroup.balance)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        ({monthGroup.rows.length})
                                    </Typography>
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{ pt: 0, px: 0 }}>
                                <Paper variant="outlined" sx={{ overflow: 'auto' }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                                <TableCell sx={{ minWidth: 220 }}>
                                                    {t('accountancy.attachedBookingColumn')}
                                                </TableCell>
                                                <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                                <TableCell>{t('accountancy.source')}</TableCell>
                                                <TableCell>{t('accountancy.recipient')}</TableCell>
                                                <TableCell align="right">
                                                    {t('accountancy.amountColumn')}
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {monthGroup.rows.map((row) => (
                                                <TableRow key={`${row.type}-${row._id}`}>
                                                    <TableCell>{formatDate(row.date)}</TableCell>
                                                    <TableCell
                                                        sx={{
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                            maxWidth: 360,
                                                        }}
                                                    >
                                                        {formatAttachedBooking(row.bookingId)}
                                                    </TableCell>
                                                    <TableCell>{row.category}</TableCell>
                                                    <TableCell
                                                        sx={{
                                                            maxWidth: 200,
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                        }}
                                                    >
                                                        {labelSource(row.source)}
                                                    </TableCell>
                                                    <TableCell
                                                        sx={{
                                                            maxWidth: 200,
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                        }}
                                                    >
                                                        {row.recipientLabel}
                                                    </TableCell>
                                                    <TableCell
                                                        align="right"
                                                        sx={{
                                                            color:
                                                                row.amount >= 0
                                                                    ? 'success.main'
                                                                    : 'error.main',
                                                            fontWeight: 500,
                                                        }}
                                                    >
                                                        {formatAmount(row.amount)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </Paper>
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Box>
            )}
        </Box>
    );
}

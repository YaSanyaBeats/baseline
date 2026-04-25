'use client';

import {
    Box,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
    Alert,
    IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEffect, useMemo, useState } from 'react';
import { Booking, Expense, Income } from '@/lib/types';
import { getExpenses, deleteExpense } from '@/lib/expenses';
import { getIncomes, deleteIncome } from '@/lib/incomes';
import { getCashflows } from '@/lib/cashflows';
import { getExpenseSum, getIncomeSum } from '@/lib/accountancyUtils';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import Link from 'next/link';
import { getBookingsByIds } from '@/lib/bookings';
import { getCounterparties } from '@/lib/counterparties';
import { getUsersWithCashflow } from '@/lib/users';
import { formatSourceRecipientLabel } from '@/components/accountancy/SourceRecipientSelect';
import { useObjects } from '@/providers/ObjectsProvider';

type RecordRow = {
    _id: string;
    type: 'expense' | 'income';
    date: Date | string;
    category: string;
    amount: number;
    canEdit: boolean;
    bookingId?: number;
    source?: string;
    recipient?: string;
};

export default function Page() {
    const { t } = useTranslation();
    const { objects } = useObjects();
    const { user, isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [usersWithCashflow, setUsersWithCashflow] = useState<{ _id: string; name: string }[]>([]);
    const [allCashflows, setAllCashflows] = useState<{ _id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);

    const hasAccess = isAdmin || isAccountant || Boolean(user?.hasCashflow);
    const canEditOnlyDraft = user?.hasCashflow && !isAdmin && !isAccountant;

    useEffect(() => {
        if (!hasAccess) {
            setLoading(false);
            return;
        }
        Promise.all([
            getExpenses(),
            getIncomes(),
            getCashflows(),
            getCounterparties(),
            getUsersWithCashflow(),
        ])
            .then(async ([expList, incList, cfList, cpList, usersCf]) => {
                const uid = user?._id?.toString?.() ?? (user as { _id?: string })?._id;
                const userCf = uid ? cfList.find((cf) => cf.userId === uid) : undefined;
                const cfId = userCf?._id;

                setAllCashflows(cfList.map((c) => ({ _id: c._id!, name: c.name })));
                setCounterparties(cpList.map((c) => ({ _id: c._id!, name: c.name })));
                setUsersWithCashflow(usersCf);

                if (cfId) {
                    const expFiltered = expList.filter((e) => e.cashflowId === cfId);
                    const incFiltered = incList.filter((i) => i.cashflowId === cfId);
                    setExpenses(expFiltered);
                    setIncomes(incFiltered);

                    const bookingIds = Array.from(
                        new Set(
                            [...expFiltered, ...incFiltered]
                                .map((r) => r.bookingId)
                                .filter((id): id is number => typeof id === 'number'),
                        ),
                    );
                    if (bookingIds.length > 0) {
                        const bookingList = await getBookingsByIds(bookingIds);
                        setBookings(bookingList);
                    } else {
                        setBookings([]);
                    }
                } else {
                    setExpenses([]);
                    setIncomes([]);
                    setBookings([]);
                }
            })
            .catch((err) => {
                console.error(err);
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
            })
            .finally(() => setLoading(false));
    }, [hasAccess, user?._id]);

    const bookingsById = useMemo(() => {
        const m = new Map<number, Booking>();
        bookings.forEach((b) => m.set(b.id, b));
        return m;
    }, [bookings]);

    // Расходы — со знаком минус, доходы — со знаком плюс
    const balance =
        incomes.reduce((s, i) => s + getIncomeSum(i), 0) -
        expenses.reduce((s, e) => s + getExpenseSum(e), 0);

    const rows: RecordRow[] = [
        ...expenses.map((e) => ({
            _id: e._id!,
            type: 'expense' as const,
            date: e.date,
            category: e.category,
            amount: -getExpenseSum(e),
            canEdit: canEditOnlyDraft ? e.status === 'draft' : true,
            bookingId: e.bookingId,
            source: e.source,
            recipient: e.recipient,
        })),
        ...incomes.map((i) => ({
            _id: i._id!,
            type: 'income' as const,
            date: i.date,
            category: i.category,
            amount: getIncomeSum(i),
            canEdit: canEditOnlyDraft ? i.status === 'draft' : true,
            bookingId: i.bookingId,
            source: i.source,
            recipient: i.recipient,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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

    const roomFromBookingLabel = t('accountancy.sourceRecipientRoomFromBooking');

    const labelSource = (value: string | undefined) =>
        formatSourceRecipientLabel(
            value,
            objects,
            counterparties,
            usersWithCashflow,
            allCashflows,
            roomFromBookingLabel,
        );

    const formatAmount = (value: number): string => {
        const fixed = Number(value).toFixed(2);
        const [intPart, decPart] = fixed.split('.');
        const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return `${value >= 0 ? '+' : ''}${withSpaces}.${decPart ?? '00'}`;
    };

    const handleDeleteExpense = (id: string) => {
        if (!window.confirm(t('accountancy.deleteExpenseMessage'))) return;
        deleteExpense(id)
            .then((res) => {
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseDeleted'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) setExpenses((prev) => prev.filter((e) => e._id !== id));
            })
            .catch(() => {
                setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
            });
    };

    const handleDeleteIncome = (id: string) => {
        if (!window.confirm(t('accountancy.deleteIncomeMessage'))) return;
        deleteIncome(id)
            .then((res) => {
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeDeleted'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) setIncomes((prev) => prev.filter((i) => i._id !== id));
            })
            .catch(() => {
                setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
            });
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.myCashflowTitle')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('accountancy.myCashflowTitle')}
            </Typography>

            <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="h3" sx={{ fontWeight: 700 }} color={balance >= 0 ? 'success.main' : 'error.main'}>
                    {formatAmount(balance)}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    {t('accountancy.myCashflowBalance')}
                </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Link href="/dashboard/accountancy/cashflow/expense/add">
                    <Button variant="contained" startIcon={<AddIcon />}>
                        {t('accountancy.addExpense')}
                    </Button>
                </Link>
                <Link href="/dashboard/accountancy/cashflow/income/add">
                    <Button variant="contained" startIcon={<AddIcon />}>
                        {t('accountancy.addIncome')}
                    </Button>
                </Link>
            </Box>

            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : rows.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">{t('accountancy.myCashflowNoRecords')}</Typography>
                </Paper>
            ) : (
                <Paper variant="outlined" sx={{ overflow: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                <TableCell sx={{ minWidth: 220 }}>{t('accountancy.attachedBookingColumn')}</TableCell>
                                <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                <TableCell>{t('accountancy.source')}</TableCell>
                                <TableCell>{t('accountancy.recipient')}</TableCell>
                                <TableCell align="right">{t('accountancy.amountColumn')}</TableCell>
                                <TableCell width={100} align="right">
                                    {t('accountancy.actions')}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map((row) => (
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
                                    <TableCell sx={{ maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                        {labelSource(row.source)}
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                        {labelSource(row.recipient)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        sx={{
                                            color: row.amount >= 0 ? 'success.main' : 'error.main',
                                            fontWeight: 500,
                                        }}
                                    >
                                        {formatAmount(row.amount)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {row.canEdit && (
                                            <>
                                                <Link
                                                    href={
                                                        row.type === 'expense'
                                                            ? `/dashboard/cashflow/expense/edit/${row._id}`
                                                            : `/dashboard/accountancy/income/edit/${row._id}`
                                                    }
                                                >
                                                    <IconButton size="small" aria-label={t('common.view')}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Link>
                                                <IconButton
                                                    size="small"
                                                    aria-label={t('common.delete')}
                                                    onClick={() =>
                                                        row.type === 'expense'
                                                            ? handleDeleteExpense(row._id)
                                                            : handleDeleteIncome(row._id)
                                                    }
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}
        </Box>
    );
}

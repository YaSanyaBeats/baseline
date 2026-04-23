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
    Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEffect, useState } from 'react';
import { Expense, Income } from '@/lib/types';
import { getExpenses, deleteExpense } from '@/lib/expenses';
import { getIncomes, deleteIncome } from '@/lib/incomes';
import { getCashflows } from '@/lib/cashflows';
import { getExpenseSum, getIncomeSum } from '@/lib/accountancyUtils';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import Link from 'next/link';

type RecordRow = {
    _id: string;
    type: 'expense' | 'income';
    date: Date | string;
    category: string;
    amount: number;
    status: string;
    canEdit: boolean;
};

export default function Page() {
    const { t } = useTranslation();
    const { user, isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [loading, setLoading] = useState(true);

    const hasAccess = isAdmin || isAccountant || Boolean(user?.hasCashflow);
    const canEditOnlyDraft = user?.hasCashflow && !isAdmin && !isAccountant;

    useEffect(() => {
        if (!hasAccess) {
            setLoading(false);
            return;
        }
        Promise.all([getExpenses(), getIncomes(), getCashflows()])
            .then(([expList, incList, cfList]) => {
                const uid = user?._id?.toString?.() ?? (user as { _id?: string })?._id;
                const userCf = uid ? cfList.find((cf) => cf.userId === uid) : undefined;
                const cfId = userCf?._id;

                if (cfId) {
                    setExpenses(expList.filter((e) => e.cashflowId === cfId));
                    setIncomes(incList.filter((i) => i.cashflowId === cfId));
                } else {
                    setExpenses([]);
                    setIncomes([]);
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
            status: e.status ?? 'draft',
            canEdit: canEditOnlyDraft ? e.status === 'draft' : true,
        })),
        ...incomes.map((i) => ({
            _id: i._id!,
            type: 'income' as const,
            date: i.date,
            category: i.category,
            amount: getIncomeSum(i),
            status: i.status ?? 'draft',
            canEdit: canEditOnlyDraft ? i.status === 'draft' : true,
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

    const formatAmount = (value: number): string => {
        const fixed = Number(value).toFixed(2);
        const [intPart, decPart] = fixed.split('.');
        const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return `${value >= 0 ? '+' : ''}${withSpaces}.${decPart ?? '00'}`;
    };

    const getStatusLabel = (status: string) =>
        status === 'draft' ? t('accountancy.statusDraft') : t('accountancy.statusConfirmed');

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
                                <TableCell>{t('accountancy.category')}</TableCell>
                                <TableCell>{t('common.status')}</TableCell>
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
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={row.type === 'expense' ? t('accountancy.expense') : t('accountancy.income')}
                                            variant="outlined"
                                            sx={{ mr: 0.5 }}
                                        />
                                        {row.category}
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={getStatusLabel(row.status)}
                                            variant={row.status === 'confirmed' ? 'filled' : 'outlined'}
                                            color={row.status === 'confirmed' ? 'success' : 'default'}
                                        />
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

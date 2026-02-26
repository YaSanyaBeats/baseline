'use client';

import {
    Box,
    Button,
    Typography,
    Alert,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    IconButton,
    Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cashflow, Expense, Income } from '@/lib/types';
import { getCashflows, deleteCashflow } from '@/lib/cashflows';
import { getCounterparties } from '@/lib/counterparties';
import { getExpenses } from '@/lib/expenses';
import { getIncomes } from '@/lib/incomes';
import { getExpenseSum } from '@/lib/accountancyUtils';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';

const CASHFLOW_TYPE_KEYS: Record<string, string> = {
    company: 'typeCompany',
    employee: 'typeEmployee',
    room: 'typeRoom',
    object: 'typeObject',
    premium: 'typePremium',
    other: 'typeOther',
};

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();
    const { setSnackbar } = useSnackbar();

    const [cashflows, setCashflows] = useState<Cashflow[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [loading, setLoading] = useState(true);

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess) return;

        const load = async () => {
            try {
                const [cashflowsList, counterpartiesList, expensesList, incomesList] = await Promise.all([
                    getCashflows(),
                    getCounterparties(),
                    getExpenses(),
                    getIncomes(),
                ]);
                setCashflows(cashflowsList);
                setCounterparties(counterpartiesList.map((c) => ({ _id: c._id!, name: c.name })));
                setExpenses(expensesList);
                setIncomes(incomesList);
            } catch (error) {
                console.error('Error loading cashflows:', error);
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [hasAccess]);

    const formatAmount = (value: number): string => {
        return value.toLocaleString('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const balanceByCashflow = cashflows.reduce<Record<string, number>>((acc, cf) => {
        if (!cf._id) return acc;
        const expenseSum = expenses
            .filter((e) => e.cashflowId === cf._id)
            .reduce((s, e) => s + getExpenseSum(e), 0);
        const incomeSum = incomes
            .filter((i) => i.cashflowId === cf._id)
            .reduce((s, i) => s + (i.amount ?? 0) * (i.quantity ?? 1), 0);
        acc[cf._id] = incomeSum - expenseSum;
        return acc;
    }, {});

    const getRoomLinksLabel = (roomLinks: { id: number; rooms: number[] }[]) => {
        if (!roomLinks?.length) return '—';
        return roomLinks
            .map((link) => {
                const obj = objects.find((o) => o.id === link.id);
                const objName = obj?.name ?? `Объект ${link.id}`;
                const roomNames = link.rooms
                    .map((rid) => {
                        const room = obj?.roomTypes?.find((r) => r.id === rid);
                        return room?.name ?? rid;
                    })
                    .join(', ');
                return `${objName}: ${roomNames}`;
            })
            .join('; ');
    };

    const getTypeLabel = (type: string) => {
        const key = CASHFLOW_TYPE_KEYS[type] ?? 'typeOther';
        return t(`accountancy.cashflow.${key}`);
    };

    const getCounterpartyNames = (counterpartyIds: string[] | undefined) => {
        if (!counterpartyIds?.length) return '—';
        return counterpartyIds
            .map((id) => counterparties.find((c) => c._id === id)?.name ?? id)
            .join(', ');
    };

    const handleDelete = (cf: Cashflow) => {
        if (!cf._id) return;
        if (!window.confirm(t('accountancy.cashflow.deleteConfirm'))) return;

        deleteCashflow(cf._id)
            .then((res) => {
                setSnackbar({
                    open: true,
                    message: res.message,
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setCashflows((prev) => prev.filter((c) => c._id !== cf._id));
                }
            })
            .catch(() => {
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
            });
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.cashflow.title')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">{t('accountancy.cashflow.title')}</Typography>
                <Link href="/dashboard/accountancy/cashflow/add">
                    <Button variant="contained" startIcon={<AddIcon />}>
                        {t('accountancy.cashflow.add')}
                    </Button>
                </Link>
            </Box>

            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : cashflows.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">{t('accountancy.cashflow.noCashflows')}</Typography>
                    <Link href="/dashboard/accountancy/cashflow/add">
                        <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }}>
                            {t('accountancy.cashflow.add')}
                        </Button>
                    </Link>
                </Paper>
            ) : (
                <Paper variant="outlined" sx={{ overflow: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('accountancy.cashflow.name')}</TableCell>
                                <TableCell>{t('accountancy.cashflow.type')}</TableCell>
                                <TableCell>{t('accountancy.cashflow.rooms')}</TableCell>
                                <TableCell>{t('accountancy.cashflow.counterparties')}</TableCell>
                                <TableCell>{t('accountancy.cashflow.balance')}</TableCell>
                                <TableCell>{t('accountancy.comment')}</TableCell>
                                <TableCell width={100} align="right">
                                    {t('accountancy.actions')}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {cashflows.map((cf) => {
                                const balance = balanceByCashflow[cf._id!] ?? 0;
                                return (
                                    <TableRow key={cf._id}>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={500}>
                                                {cf.name}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip size="small" label={getTypeLabel(cf.type)} variant="outlined" />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 280 }}>
                                                {getRoomLinksLabel(cf.roomLinks ?? [])}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200 }}>
                                                {getCounterpartyNames(cf.counterpartyIds)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color:
                                                        balance > 0
                                                            ? 'success.main'
                                                            : balance < 0
                                                              ? 'error.main'
                                                              : 'text.secondary',
                                                }}
                                            >
                                                {formatAmount(balance)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200 }}>
                                                {cf.comment || '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Link href={`/dashboard/accountancy/cashflow/edit/${cf._id}`}>
                                                <IconButton size="small" aria-label={t('accountancy.editCategory')}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Link>
                                            <IconButton
                                                size="small"
                                                aria-label={t('common.delete')}
                                                onClick={() => handleDelete(cf)}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Paper>
            )}
        </Box>
    );
}

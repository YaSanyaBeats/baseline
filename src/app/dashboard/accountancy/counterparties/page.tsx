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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Counterparty, Expense } from '@/lib/types';
import { getCounterparties, deleteCounterparty } from '@/lib/counterparties';
import { getExpenses } from '@/lib/expenses';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();
    const { setSnackbar } = useSnackbar();

    const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess) return;

        const load = async () => {
            try {
                const [counterpartiesList, expensesList] = await Promise.all([
                    getCounterparties(),
                    getExpenses(),
                ]);
                setCounterparties(counterpartiesList);
                setExpenses(expensesList);
            } catch (error) {
                console.error('Error loading counterparties:', error);
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

    const balanceByCounterparty = counterparties.reduce<Record<string, number>>((acc, cp) => {
        if (!cp._id) return acc;
        const sum = expenses
            .filter((e) => e.counterpartyId === cp._id)
            .reduce((s, e) => s + e.amount, 0);
        acc[cp._id] = sum;
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

    const handleDelete = (cp: Counterparty) => {
        if (!cp._id) return;
        if (!window.confirm(t('accountancy.counterparty.deleteConfirm'))) return;

        deleteCounterparty(cp._id)
            .then((res) => {
                setSnackbar({
                    open: true,
                    message: res.message,
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setCounterparties((prev) => prev.filter((c) => c._id !== cp._id));
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
                <Typography variant="h4">{t('accountancy.counterparty.title')}</Typography>
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
                <Typography variant="h4">{t('accountancy.counterparty.title')}</Typography>
                <Link href="/dashboard/accountancy/counterparties/add">
                    <Button variant="contained" startIcon={<AddIcon />}>
                        {t('accountancy.counterparty.add')}
                    </Button>
                </Link>
            </Box>

            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : counterparties.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">{t('accountancy.counterparty.noCounterparties')}</Typography>
                    <Link href="/dashboard/accountancy/counterparties/add">
                        <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }}>
                            {t('accountancy.counterparty.add')}
                        </Button>
                    </Link>
                </Paper>
            ) : (
                <Paper variant="outlined" sx={{ overflow: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('accountancy.counterparty.name')}</TableCell>
                                <TableCell>{t('accountancy.counterparty.rooms')}</TableCell>
                                <TableCell>{t('accountancy.counterparty.balance')}</TableCell>
                                <TableCell>{t('accountancy.comment')}</TableCell>
                                <TableCell width={100} align="right">
                                    {t('accountancy.actions')}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {counterparties.map((cp) => {
                                const balance = balanceByCounterparty[cp._id!] ?? 0;
                                return (
                                    <TableRow key={cp._id}>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={500}>
                                                {cp.name}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 280 }}>
                                                {getRoomLinksLabel(cp.roomLinks ?? [])}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography
                                                variant="body2"
                                                sx={{ color: balance > 0 ? 'error.main' : 'text.secondary' }}
                                            >
                                                {formatAmount(balance)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200 }}>
                                                {cp.comment || '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Link href={`/dashboard/accountancy/counterparties/edit/${cp._id}`}>
                                                <IconButton size="small" aria-label={t('accountancy.editCategory')}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Link>
                                            <IconButton
                                                size="small"
                                                aria-label={t('common.delete')}
                                                onClick={() => handleDelete(cp)}
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

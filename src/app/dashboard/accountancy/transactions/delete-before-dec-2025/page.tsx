'use client';

import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Paper,
    Stack,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import Link from 'next/link';
import { useState } from 'react';
import { useUser } from '@/providers/UserProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useTranslation } from '@/i18n/useTranslation';
import type { DeleteTransactionsBeforeReportMonthStats } from '@/lib/migrations/deleteTransactionsBeforeReportMonth';

export default function DeleteTransactionsBeforeDec2025Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();

    const [loadingPreview, setLoadingPreview] = useState(false);
    const [loadingDelete, setLoadingDelete] = useState(false);
    const [stats, setStats] = useState<DeleteTransactionsBeforeReportMonthStats | null>(null);
    const [isDryRun, setIsDryRun] = useState(true);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const hasAccess = isAdmin || isAccountant;

    const handlePreview = async () => {
        setLoadingPreview(true);
        try {
            const res = await fetch('/api/accountancy/delete-transactions-before-report-month');
            const data = await res.json();
            if (data.success && data.stats) {
                setStats(data.stats);
                setIsDryRun(true);
                setSnackbar({ open: true, message: data.message, severity: 'info' });
            } else {
                setSnackbar({
                    open: true,
                    message: data.message || t('common.serverError'),
                    severity: 'error',
                });
            }
        } catch (err) {
            console.error(err);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleDelete = async () => {
        setConfirmOpen(false);
        setLoadingDelete(true);
        try {
            const res = await fetch('/api/accountancy/delete-transactions-before-report-month', {
                method: 'POST',
            });
            const data = await res.json();
            if (data.success && data.stats) {
                setStats(data.stats);
                setIsDryRun(false);
                setSnackbar({ open: true, message: data.message, severity: 'success' });
            } else {
                setSnackbar({
                    open: true,
                    message: data.message || t('common.serverError'),
                    severity: 'error',
                });
            }
        } catch (err) {
            console.error(err);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setLoadingDelete(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.deleteBeforeDec2025Title')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    const totalMatched = stats ? stats.expensesMatched + stats.incomesMatched : 0;
    const totalDeleted = stats ? stats.expensesDeleted + stats.incomesDeleted : 0;

    return (
        <>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy/transactions">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 1 }}>
                {t('accountancy.deleteBeforeDec2025Title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {t('accountancy.deleteBeforeDec2025Description')}
            </Typography>

            <Alert severity="warning" sx={{ mb: 3, maxWidth: 720 }}>
                {t('accountancy.deleteBeforeDec2025Warning')}
            </Alert>

            <Paper variant="outlined" sx={{ p: 2, maxWidth: 560 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button
                        variant="outlined"
                        onClick={handlePreview}
                        disabled={loadingPreview || loadingDelete}
                        startIcon={loadingPreview ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                        {loadingPreview ? '…' : t('accountancy.deleteBeforeDec2025PreviewButton')}
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<DeleteForeverIcon />}
                        disabled={loadingPreview || loadingDelete || !stats || totalMatched === 0}
                        onClick={() => setConfirmOpen(true)}
                    >
                        {loadingDelete ? '…' : t('accountancy.deleteBeforeDec2025RunButton')}
                    </Button>
                </Stack>
            </Paper>

            {stats && (
                <Alert severity={isDryRun ? 'info' : 'success'} sx={{ mt: 3, maxWidth: 720 }}>
                    <Typography variant="body2" component="div" sx={{ mb: 1 }}>
                        {isDryRun
                            ? t('accountancy.deleteBeforeDec2025PreviewResult')
                            : t('accountancy.deleteBeforeDec2025DoneResult')}
                    </Typography>
                    <Stack component="ul" sx={{ m: 0, pl: 2.5, typography: 'body2' }} spacing={0.5}>
                        <li>
                            {t('accountancy.expenses')}:{' '}
                            {isDryRun ? stats.expensesMatched : stats.expensesDeleted} /{' '}
                            {stats.expensesMatched}
                        </li>
                        <li>
                            {t('accountancy.income')}:{' '}
                            {isDryRun ? stats.incomesMatched : stats.incomesDeleted} / {stats.incomesMatched}
                        </li>
                        <li>
                            {t('accountancy.deleteBeforeDec2025Total')}:{' '}
                            {isDryRun ? totalMatched : totalDeleted}
                        </li>
                    </Stack>
                </Alert>
            )}

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>{t('accountancy.deleteBeforeDec2025ConfirmTitle')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t('accountancy.deleteBeforeDec2025ConfirmMessage').replace(
                            '{{count}}',
                            String(totalMatched),
                        )}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
                    <Button
                        onClick={handleDelete}
                        color="error"
                        variant="contained"
                        disabled={loadingDelete}
                    >
                        {t('accountancy.deleteBeforeDec2025RunButton')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

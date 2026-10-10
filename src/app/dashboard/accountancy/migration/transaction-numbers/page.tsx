'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useUser } from '@/providers/UserProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useTranslation } from '@/i18n/useTranslation';
import type { MigrateTransactionNumbersStats } from '@/lib/migrations/migrateTransactionNumbers';

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const [stats, setStats] = useState<MigrateTransactionNumbersStats | null>(null);

    const hasAccess = isAdmin || isAccountant;

    const handleMigrate = async () => {
        if (!hasAccess) return;
        setLoading(true);
        setMessage(null);
        setFailed(false);
        setStats(null);
        try {
            const res = await fetch('/api/accountancy/migrate-transaction-numbers', { method: 'POST' });
            const data = (await res.json()) as {
                success?: boolean;
                message?: string;
                stats?: MigrateTransactionNumbersStats;
            };
            if (data.success) {
                setMessage(data.message ?? '');
                setStats(data.stats ?? null);
                setSnackbar({
                    open: true,
                    message: data.message ?? t('common.success'),
                    severity: 'success',
                });
            } else {
                setFailed(true);
                setMessage(data.message || t('common.serverError'));
                setSnackbar({
                    open: true,
                    message: data.message || t('common.serverError'),
                    severity: 'error',
                });
            }
        } catch (err) {
            console.error(err);
            setFailed(true);
            setMessage(t('common.serverError'));
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4" sx={{ mb: 2 }}>
                    Числовые ID транзакций
                </Typography>
                <Alert severity="warning">{t('accountancy.noAccess')}</Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 2 }}>
                Числовые ID транзакций
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
                Проставляет расходам и доходам без номера последовательный ID: 1, 2, 3 и дальше.
                Сначала идут более старые записи. Номера, которые уже стоят, не меняются.
                Повторный запуск безопасен: он дописывает номера только тем, у кого их ещё нет.
                Новые транзакции получают следующий номер сами, эту страницу для них открывать не нужно.
            </Alert>
            <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    onClick={() => void handleMigrate()}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                >
                    {loading ? 'Выполняется…' : 'Проставить номера'}
                </Button>
                <Link href="/dashboard/accountancy/migration">
                    <Button variant="outlined" startIcon={<ArrowBackIcon />} disabled={loading}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Stack>
            {message ? (
                <Alert severity={failed ? 'error' : 'success'}>
                    <Typography variant="body2">{message}</Typography>
                    {stats ? (
                        <Stack component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }} spacing={0.5}>
                            <li>Расходов обновлено: {stats.expensesUpdated}</li>
                            <li>Доходов обновлено: {stats.incomesUpdated}</li>
                            <li>Уже имели номер: {stats.alreadyNumbered}</li>
                            {stats.firstAssigned != null && stats.lastAssigned != null ? (
                                <li>
                                    Выдан диапазон: {stats.firstAssigned}–{stats.lastAssigned}
                                </li>
                            ) : null}
                        </Stack>
                    ) : null}
                </Alert>
            ) : null}
        </Box>
    );
}

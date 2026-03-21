'use client';

import { Box, Button, Typography, Alert, CircularProgress } from '@mui/material';
import Link from 'next/link';
import { useState } from 'react';
import { useUser } from '@/providers/UserProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useTranslation } from '@/i18n/useTranslation';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ expensesUpdated: number; incomesUpdated: number } | null>(null);
    const [loadingRecordType, setLoadingRecordType] = useState(false);
    const [resultRecordType, setResultRecordType] = useState<{
        expensesUpdated: number;
        incomesUpdated: number;
    } | null>(null);

    const hasAccess = isAdmin || isAccountant;

    const handleMigrate = async () => {
        if (!hasAccess) return;
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch('/api/accountancy/migrate-counterparty-cashflow', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setResult({ expensesUpdated: data.expensesUpdated, incomesUpdated: data.incomesUpdated });
                setSnackbar({ open: true, message: data.message, severity: 'success' });
            } else {
                setSnackbar({ open: true, message: data.message || 'Ошибка миграции', severity: 'error' });
            }
        } catch (err) {
            console.error(err);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleMigrateRecordType = async () => {
        if (!hasAccess) return;
        setLoadingRecordType(true);
        setResultRecordType(null);
        try {
            const res = await fetch('/api/accountancy/migrate-transaction-record-type', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setResultRecordType({
                    expensesUpdated: data.expensesUpdated,
                    incomesUpdated: data.incomesUpdated,
                });
                setSnackbar({ open: true, message: data.message, severity: 'success' });
            } else {
                setSnackbar({ open: true, message: data.message || t('common.serverError'), severity: 'error' });
            }
        } catch (err) {
            console.error(err);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setLoadingRecordType(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4" sx={{ mb: 2 }}>
                    Миграция: Контрагент и Кэшфлоу → Кому
                </Typography>
                <Alert severity="warning">{t('accountancy.noAccess')}</Alert>
                <Link href="/dashboard/accountancy" style={{ marginTop: 16, display: 'inline-block' }}>
                    <Button variant="outlined" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 2 }}>
                Миграция: Контрагент и Кэшфлоу → Кому
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
                Эта миграция переносит значения из полей «Контрагент» и «Кэшфлоу» в поле «Кому» для всех
                расходов и доходов. Контрагент становится получателем вида «Контрагент: ...», кэшфлоу-сотрудник —
                «Пользователь: ...». После миграции поля «Контрагент» и «Кэшфлоу» будут очищены.
            </Alert>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    onClick={handleMigrate}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                >
                    {loading ? 'Выполняется...' : 'Выполнить миграцию'}
                </Button>
                <Link href="/dashboard/accountancy">
                    <Button variant="outlined" startIcon={<ArrowBackIcon />} disabled={loading}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
            {result && (
                <Alert severity="success" sx={{ mt: 2 }}>
                    Обновлено расходов: {result.expensesUpdated}, доходов: {result.incomesUpdated}.
                </Alert>
            )}

            <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
                {t('accountancy.migrateTransactionRecordTypeTitle')}
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
                {t('accountancy.migrateTransactionRecordTypeDescription')}
            </Alert>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={handleMigrateRecordType}
                    disabled={loadingRecordType || loading}
                    startIcon={loadingRecordType ? <CircularProgress size={20} color="inherit" /> : null}
                >
                    {loadingRecordType ? '…' : t('accountancy.migrateTransactionRecordTypeButton')}
                </Button>
            </Box>
            {resultRecordType && (
                <Alert severity="success" sx={{ mt: 2 }}>
                    Обновлено расходов: {resultRecordType.expensesUpdated}, доходов:{' '}
                    {resultRecordType.incomesUpdated}.
                </Alert>
            )}
        </Box>
    );
}

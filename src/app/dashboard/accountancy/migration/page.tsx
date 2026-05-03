'use client';

import { Box, Button, Typography, Alert, CircularProgress, Stack } from '@mui/material';
import Link from 'next/link';
import { useState } from 'react';
import { useUser } from '@/providers/UserProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useTranslation } from '@/i18n/useTranslation';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import type { MigrateRoomNamesStats } from '@/lib/migrations/migrateRoomIdsToNames';

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const [loadingRoomNames, setLoadingRoomNames] = useState(false);
    const [roomNamesMessage, setRoomNamesMessage] = useState<string | null>(null);
    const [roomNamesStats, setRoomNamesStats] = useState<MigrateRoomNamesStats | null>(null);
    const [roomNamesFailed, setRoomNamesFailed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ expensesUpdated: number; incomesUpdated: number } | null>(null);
    const [loadingRecordType, setLoadingRecordType] = useState(false);
    const [resultRecordType, setResultRecordType] = useState<{
        expensesUpdated: number;
        incomesUpdated: number;
    } | null>(null);

    const hasAccess = isAdmin || isAccountant;

    const handleMigrateRoomNames = async () => {
        if (!hasAccess) return;
        setLoadingRoomNames(true);
        setRoomNamesMessage(null);
        setRoomNamesStats(null);
        setRoomNamesFailed(false);
        try {
            const res = await fetch('/api/accountancy/migrate-room-names', { method: 'POST' });
            const data = (await res.json()) as {
                success: boolean;
                message?: string;
                stats?: MigrateRoomNamesStats;
            };
            if (data.success && data.stats) {
                setRoomNamesFailed(false);
                setRoomNamesMessage(data.message ?? '');
                setRoomNamesStats(data.stats);
                setSnackbar({
                    open: true,
                    message: data.message ?? t('common.success'),
                    severity: data.stats.errors.length > 0 ? 'warning' : 'success',
                });
            } else {
                setRoomNamesFailed(true);
                setRoomNamesMessage(data.message || t('common.serverError'));
                setRoomNamesStats(data.stats ?? null);
                setSnackbar({
                    open: true,
                    message: data.message || t('common.serverError'),
                    severity: 'error',
                });
            }
        } catch (err) {
            console.error(err);
            setRoomNamesFailed(true);
            setRoomNamesMessage(t('common.serverError'));
            setRoomNamesStats(null);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setLoadingRoomNames(false);
        }
    };

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
                    {t('accountancy.migrationPageTitle')}
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
                Миграция: комнаты (unit id → имя)
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
                Переводит привязку к комнатам с числового unit id на стабильное имя юнита по данным коллекции{' '}
                <strong>objects</strong>: <strong>expenses</strong>, <strong>incomes</strong>,{' '}
                <strong>objectRoomMetadata_rooms</strong>, <strong>autoAccountingRules</strong>,{' '}
                <strong>users</strong>. Строки «От кого»/«Кому» вида{' '}
                <code>room:objectId:число</code> переписываются на формат с именем. Коллекцию{' '}
                <strong>objectRoomMetadata_objects</strong> не трогаем.
            </Alert>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleMigrateRoomNames}
                    disabled={loadingRoomNames || loading || loadingRecordType}
                    startIcon={loadingRoomNames ? <CircularProgress size={20} color="inherit" /> : null}
                >
                    {loadingRoomNames ? 'Выполняется…' : 'Запустить миграцию комнат'}
                </Button>
            </Box>
            {roomNamesMessage && !roomNamesFailed && (
                <Alert severity={roomNamesStats?.errors.length ? 'warning' : 'success'} sx={{ mt: 2, mb: 4 }}>
                    <Typography variant="body2" component="div" sx={{ mb: roomNamesStats ? 1 : 0 }}>
                        {roomNamesMessage}
                    </Typography>
                    {roomNamesStats && (
                        <Stack component="ul" sx={{ m: 0, pl: 2.5, typography: 'body2' }} spacing={0.5}>
                            <li>
                                Расходы: обновлено {roomNamesStats.expenses.updated} из{' '}
                                {roomNamesStats.expenses.scanned}
                            </li>
                            <li>
                                Доходы: {roomNamesStats.incomes.updated} / {roomNamesStats.incomes.scanned}
                            </li>
                            <li>
                                Метаданные комнат: {roomNamesStats.objectRoomMetadataRooms.updated} /{' '}
                                {roomNamesStats.objectRoomMetadataRooms.scanned}
                            </li>
                            <li>
                                Правила автоучёта: {roomNamesStats.autoAccountingRules.updated} /{' '}
                                {roomNamesStats.autoAccountingRules.scanned}
                            </li>
                            <li>
                                Пользователи: {roomNamesStats.users.updated} / {roomNamesStats.users.scanned}
                            </li>
                            {roomNamesStats.objectRoomMetadataObjects.skipped ? (
                                <li>{roomNamesStats.objectRoomMetadataObjects.note}</li>
                            ) : null}
                        </Stack>
                    )}
                </Alert>
            )}
            {!roomNamesFailed && roomNamesStats && roomNamesStats.errors.length > 0 ? (
                <Alert severity="warning" sx={{ mb: 4 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Предупреждения ({roomNamesStats.errors.length})
                    </Typography>
                    <Stack component="ul" sx={{ m: 0, pl: 2.5, typography: 'body2', maxHeight: 240, overflow: 'auto' }}>
                        {roomNamesStats.errors.map((err, i) => (
                            <li key={i}>
                                {err}
                            </li>
                        ))}
                    </Stack>
                </Alert>
            ) : null}
            {roomNamesFailed && roomNamesMessage ? (
                <Alert severity="error" sx={{ mt: 2, mb: 4 }}>
                    {roomNamesMessage}
                </Alert>
            ) : null}

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
                    disabled={loading || loadingRoomNames}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                >
                    {loading ? 'Выполняется...' : 'Выполнить миграцию'}
                </Button>
                <Link href="/dashboard/accountancy">
                    <Button variant="outlined" startIcon={<ArrowBackIcon />} disabled={loading || loadingRoomNames}>
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
                    disabled={loadingRecordType || loading || loadingRoomNames}
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

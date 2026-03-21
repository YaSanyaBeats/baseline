'use client';

import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useState } from 'react';
import { useUser } from '@/providers/UserProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useMigratePropertyObjectIds } from '@/hooks/useMigratePropertyObjectIds';
import type { MigratePropertyObjectIdsResult } from '@/lib/migrations/migratePropertyObjectIdsToRoomTypeIds';

const COLLECTION_ROW_KEYS = [
    'users',
    'expenses',
    'incomes',
    'reports',
    'counterparties',
    'cashflows',
    'cashflowRules',
    'autoAccountingRules',
    'optionsExcludeObjects',
    'auditLogs',
] as const;

function StatsTable({ result }: { result: MigratePropertyObjectIdsResult }) {
    const { t } = useTranslation();
    const rows = COLLECTION_ROW_KEYS.map((key) => ({
        key,
        label: t(`adminMigrate.collections.${key}`),
        scanned: result[key].scanned,
        updated: result[key].updated,
    }));

    return (
        <Table size="small" sx={{ mt: 2 }}>
            <TableHead>
                <TableRow>
                    <TableCell>{t('adminMigrate.tableCollection')}</TableCell>
                    <TableCell align="right">{t('adminMigrate.tableScanned')}</TableCell>
                    <TableCell align="right">{t('adminMigrate.tableUpdated')}</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {rows.map((row) => (
                    <TableRow key={row.key}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell align="right">{row.scanned}</TableCell>
                        <TableCell align="right">{row.updated}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

export default function MigratePropertyRoomtypePage() {
    const { t } = useTranslation();
    const { isAdmin } = useUser();
    const { setSnackbar } = useSnackbar();
    const { migrate, loading, error, clearError } = useMigratePropertyObjectIds();
    const [lastResult, setLastResult] = useState<MigratePropertyObjectIdsResult | null>(null);
    const [pending, setPending] = useState<'dry' | 'apply' | null>(null);

    const runDry = async () => {
        clearError();
        setLastResult(null);
        setPending('dry');
        try {
            const data = await migrate(true);
            if (data.success && data.result) {
                setLastResult(data.result);
                setSnackbar({
                    open: true,
                    message: data.message || t('adminMigrate.dryRunDone'),
                    severity: 'success',
                });
            } else {
                setSnackbar({
                    open: true,
                    message: data.message || t('common.serverError'),
                    severity: 'error',
                });
            }
        } finally {
            setPending(null);
        }
    };

    const runApply = async () => {
        if (
            !window.confirm(
                t('adminMigrate.confirmApply'),
            )
        ) {
            return;
        }
        clearError();
        setLastResult(null);
        setPending('apply');
        try {
            const data = await migrate(false);
            if (data.success && data.result) {
                setLastResult(data.result);
                setSnackbar({
                    open: true,
                    message: data.message || t('adminMigrate.applyDone'),
                    severity: 'success',
                });
            } else {
                setSnackbar({
                    open: true,
                    message: data.message || t('common.serverError'),
                    severity: 'error',
                });
            }
        } finally {
            setPending(null);
        }
    };

    if (!isAdmin) {
        return (
            <Box>
                <Typography variant="h4" sx={{ mb: 2 }}>
                    {t('adminMigrate.title')}
                </Typography>
                <Alert severity="warning">{t('accountancy.noAccess')}</Alert>
                <Link href="/dashboard" style={{ marginTop: 16, display: 'inline-block' }}>
                    <Button variant="outlined" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 1 }}>
                {t('adminMigrate.title')}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
                {t('adminMigrate.subtitle')}
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
                {t('adminMigrate.info')}
            </Alert>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
                    {error}
                </Alert>
            )}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                    variant="outlined"
                    onClick={runDry}
                    disabled={loading}
                    startIcon={
                        pending === 'dry' ? <CircularProgress size={18} color="inherit" /> : undefined
                    }
                >
                    {t('adminMigrate.dryRun')}
                </Button>
                <Button
                    variant="contained"
                    color="warning"
                    onClick={runApply}
                    disabled={loading}
                    startIcon={
                        pending === 'apply' ? <CircularProgress size={18} color="inherit" /> : undefined
                    }
                >
                    {t('adminMigrate.apply')}
                </Button>
                <Link href="/dashboard">
                    <Button variant="text" startIcon={<ArrowBackIcon />} disabled={loading}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
            {lastResult && (
                <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                        {lastResult.dryRun ? t('adminMigrate.resultDryRun') : t('adminMigrate.resultApplied')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {t('adminMigrate.mapLabel')}: {lastResult.mapEntries.length}
                    </Typography>
                    {lastResult.mapEntries.length > 0 && (
                        <Box
                            component="pre"
                            sx={{
                                mt: 1,
                                p: 1,
                                bgcolor: 'action.hover',
                                borderRadius: 1,
                                fontSize: 12,
                                maxHeight: 200,
                                overflow: 'auto',
                            }}
                        >
                            {JSON.stringify(lastResult.mapEntries, null, 2)}
                        </Box>
                    )}
                    <StatsTable result={lastResult} />
                </Paper>
            )}
        </Box>
    );
}

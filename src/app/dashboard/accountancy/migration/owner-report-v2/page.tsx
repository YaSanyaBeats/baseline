'use client';

import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useState } from 'react';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { getApiErrorMessage } from '@/lib/axiosResponseMessage';

type MigrationStats = {
    scanned: number;
    updated: number;
    skipped: number;
};

export default function MigrateOwnerReportV2Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const hasAccess = isAdmin || isAccountant;

    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<MigrationStats | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    const handleRun = async () => {
        setLoading(true);
        setFailed(false);
        setMessage(null);
        setStats(null);
        try {
            const res = await fetch('/api/accountancy/migrate-owner-report-v2', { method: 'POST' });
            const data = (await res.json()) as {
                success?: boolean;
                message?: string;
                stats?: MigrationStats;
            };
            if (!res.ok || !data.success) {
                setFailed(true);
                setMessage(data.message || t('common.serverError'));
                setSnackbar({
                    open: true,
                    message: data.message || t('common.serverError'),
                    severity: 'error',
                });
                return;
            }
            setStats(data.stats ?? null);
            setMessage(data.message ?? '');
            setSnackbar({
                open: true,
                message: data.message ?? t('common.success'),
                severity: 'success',
            });
        } catch (error) {
            console.error(error);
            setFailed(true);
            const text = getApiErrorMessage(error, t('common.serverError'));
            setMessage(text);
            setSnackbar({ open: true, message: text, severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.migrateOwnerReportV2.title')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy/migration">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 1 }}>
                {t('accountancy.migrateOwnerReportV2.title')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {t('accountancy.migrateOwnerReportV2.description')}
            </Typography>

            <Button
                variant="contained"
                onClick={() => void handleRun()}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
            >
                {loading
                    ? t('accountancy.migrateOwnerReportV2.running')
                    : t('accountancy.migrateOwnerReportV2.button')}
            </Button>

            {message && (
                <Alert severity={failed ? 'error' : 'success'} sx={{ mt: 2 }}>
                    {message}
                    {stats && !failed && (
                        <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                            <li>
                                {t('accountancy.migrateOwnerReportV2.scanned')}: {stats.scanned}
                            </li>
                            <li>
                                {t('accountancy.migrateOwnerReportV2.updated')}: {stats.updated}
                            </li>
                            <li>
                                {t('accountancy.migrateOwnerReportV2.skipped')}: {stats.skipped}
                            </li>
                        </Box>
                    )}
                </Alert>
            )}
        </Box>
    );
}

'use client';

import { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    FormControlLabel,
    Paper,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { apiClient, getApiUrl } from '@/lib/api-client';
import type { OwnerReportCheckRow } from '@/lib/ownerViewRoomEarnings';
import { useUser } from '@/providers/UserProvider';

type CheckResponse = {
    success: boolean;
    message?: string;
    months?: string[];
    rows?: OwnerReportCheckRow[];
};

function formatTotal(value: number): string {
    return value.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function localeLabel(locale: OwnerReportCheckRow['locale']): string {
    return locale.startsWith('en') ? 'EN' : 'RU';
}

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const hasAccess = isAdmin || isAccountant;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [months, setMonths] = useState<string[]>([]);
    const [rows, setRows] = useState<OwnerReportCheckRow[] | null>(null);
    const [onlyFailed, setOnlyFailed] = useState(false);

    const visibleRows = useMemo(() => {
        if (!rows) return [];
        return onlyFailed ? rows.filter((row) => !row.passed) : rows;
    }, [rows, onlyFailed]);

    const failedCount = rows?.filter((row) => !row.passed).length ?? 0;
    const passedCount = rows ? rows.length - failedCount : 0;

    const handleCheck = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await apiClient.post<CheckResponse>(
                getApiUrl('accountancy/commission/report-check')
            );
            if (!response.data.success) {
                setError(response.data.message || t('accountancy.commission.reportCheck.error'));
                setRows(null);
                return;
            }
            setMonths(response.data.months ?? []);
            setRows(response.data.rows ?? []);
        } catch (err) {
            console.error('Owner report check failed:', err);
            setError(t('accountancy.commission.reportCheck.error'));
            setRows(null);
        } finally {
            setLoading(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.commission.reportCheck.title')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy/commission">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('accountancy.commission.ownerViewBackToCommission')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 1 }}>
                {t('accountancy.commission.reportCheck.title')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                {t('accountancy.commission.reportCheck.description')}
            </Typography>

            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                <Button variant="contained" onClick={handleCheck} disabled={loading}>
                    {t('accountancy.commission.reportCheck.button')}
                </Button>
                {loading && <CircularProgress size={24} />}
            </Stack>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            {rows && (
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        {t('accountancy.commission.reportCheck.months')}: {months[months.length - 1]} — {months[0]}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip
                            color="success"
                            label={`${t('accountancy.commission.reportCheck.passed')}: ${passedCount}`}
                        />
                        <Chip
                            color="error"
                            label={`${t('accountancy.commission.reportCheck.failed')}: ${failedCount}`}
                        />
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={onlyFailed}
                                    onChange={(event) => setOnlyFailed(event.target.checked)}
                                />
                            }
                            label={t('accountancy.commission.reportCheck.onlyFailed')}
                        />
                    </Stack>

                    {visibleRows.length === 0 ? (
                        <Alert severity="info">{t('accountancy.commission.reportCheck.empty')}</Alert>
                    ) : (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('accountancy.commission.reportCheck.colMonth')}</TableCell>
                                        <TableCell>{t('users.owner')}</TableCell>
                                        <TableCell>{t('accountancy.commission.reportCheck.colRoom')}</TableCell>
                                        <TableCell>{t('accountancy.commission.reportCheck.colLocale')}</TableCell>
                                        <TableCell align="right">
                                            {t('accountancy.commission.ownerEarningsRowTotal')}
                                        </TableCell>
                                        <TableCell>{t('accountancy.commission.reportCheck.colStatus')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {visibleRows.map((row) => (
                                        <TableRow
                                            key={`${row.ownerId}-${row.monthKey}-${row.locale}-${row.roomKey}`}
                                            sx={{
                                                bgcolor: (theme) =>
                                                    alpha(
                                                        row.passed
                                                            ? theme.palette.success.main
                                                            : theme.palette.error.main,
                                                        0.12
                                                    ),
                                            }}
                                        >
                                            <TableCell>{row.monthKey}</TableCell>
                                            <TableCell>{row.ownerName}</TableCell>
                                            <TableCell>{row.roomTitle}</TableCell>
                                            <TableCell>{localeLabel(row.locale)}</TableCell>
                                            <TableCell align="right">{formatTotal(row.roomTotal)}</TableCell>
                                            <TableCell>
                                                {row.passed
                                                    ? t('accountancy.commission.reportCheck.passed')
                                                    : t('accountancy.commission.reportCheck.failed')}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Stack>
            )}
        </Box>
    );
}

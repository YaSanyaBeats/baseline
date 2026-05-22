'use client';

import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useUser } from '@/providers/UserProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useTranslation } from '@/i18n/useTranslation';
import type { MigrateCategoryIdsStats } from '@/lib/migrations/migrateCategoryNamesToIds';

function CollectionStatsBlock({
    title,
    stats,
}: {
    title: string;
    stats: MigrateCategoryIdsStats['expenses'];
}) {
    return (
        <Box component="li">
            {title}: обновлено {stats.updated}, уже с ID {stats.alreadyOk}, пропущено {stats.skipped} из{' '}
            {stats.scanned}
        </Box>
    );
}

function IssuesTable({
    title,
    rows,
    showIds,
}: {
    title: string;
    rows: MigrateCategoryIdsStats['unmatched'];
    showIds?: boolean;
}) {
    if (rows.length === 0) return null;
    const limited = rows.slice(0, 50);
    return (
        <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {title} ({rows.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Коллекция</TableCell>
                            <TableCell>ID документа</TableCell>
                            <TableCell>Категория (имя)</TableCell>
                            {showIds ? <TableCell>Возможные ID</TableCell> : null}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {limited.map((row, i) => (
                            <TableRow key={`${row.collection}-${row.documentId}-${i}`}>
                                <TableCell>{row.collection}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                    {row.documentId}
                                </TableCell>
                                <TableCell>{row.category}</TableCell>
                                {showIds ? (
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        {row.categoryIds?.join(', ')}
                                    </TableCell>
                                ) : null}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            {rows.length > 50 ? (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    Показаны первые 50 из {rows.length}
                </Typography>
            ) : null}
        </Box>
    );
}

export default function CategoryIdsMigrationPage() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [loadingMigrate, setLoadingMigrate] = useState(false);
    const [stats, setStats] = useState<MigrateCategoryIdsStats | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isDryRun, setIsDryRun] = useState(true);

    const hasAccess = isAdmin || isAccountant;
    const previewStartedRef = useRef(false);

    const loadPreview = async () => {
        if (!hasAccess || loadingPreview) return;
        setLoadingPreview(true);
        try {
            const res = await fetch('/api/accountancy/migrate-category-ids');
            const data = (await res.json()) as {
                success: boolean;
                message?: string;
                stats?: MigrateCategoryIdsStats;
            };
            if (data.success && data.stats) {
                setStats(data.stats);
                setMessage(data.message ?? null);
                setIsDryRun(true);
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

    useEffect(() => {
        if (!hasAccess || previewStartedRef.current) return;
        previewStartedRef.current = true;
        void loadPreview();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз при монтировании
    }, [hasAccess]);

    const handleMigrate = async () => {
        if (!hasAccess) return;
        if (
            !window.confirm(
                'Запустить миграцию? Будет проставлено поле categoryId у расходов, доходов и правил автоучёта по совпадению имени категории.',
            )
        ) {
            return;
        }
        setLoadingMigrate(true);
        try {
            const res = await fetch('/api/accountancy/migrate-category-ids', { method: 'POST' });
            const data = (await res.json()) as {
                success: boolean;
                message?: string;
                stats?: MigrateCategoryIdsStats;
            };
            if (data.success && data.stats) {
                setStats(data.stats);
                setMessage(data.message ?? null);
                setIsDryRun(false);
                setSnackbar({
                    open: true,
                    message: data.message ?? t('common.success'),
                    severity:
                        data.stats.unmatched.length > 0 || data.stats.ambiguous.length > 0
                            ? 'warning'
                            : 'success',
                });
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
            setLoadingMigrate(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4" sx={{ mb: 2 }}>
                    {t('accountancy.migrateCategoryIdsTitle')}
                </Typography>
                <Alert severity="warning">{t('accountancy.noAccess')}</Alert>
                <Link href="/dashboard/accountancy/categories" style={{ marginTop: 16, display: 'inline-block' }}>
                    <Button variant="outlined" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
        );
    }

    const hasIssues = stats && (stats.unmatched.length > 0 || stats.ambiguous.length > 0);

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy/categories">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('accountancy.categoriesTitle')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 2 }}>
                {t('accountancy.migrateCategoryIdsTitle')}
            </Typography>

            <Alert severity="info" sx={{ mb: 2 }}>
                {t('accountancy.migrateCategoryIdsDescription')}
            </Alert>

            <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
                <Button
                    variant="outlined"
                    onClick={loadPreview}
                    disabled={loadingPreview || loadingMigrate}
                    startIcon={loadingPreview ? <CircularProgress size={20} color="inherit" /> : null}
                >
                    {loadingPreview ? '…' : t('accountancy.migrateCategoryIdsPreviewButton')}
                </Button>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleMigrate}
                    disabled={loadingPreview || loadingMigrate}
                    startIcon={loadingMigrate ? <CircularProgress size={20} color="inherit" /> : null}
                >
                    {loadingMigrate ? '…' : t('accountancy.migrateCategoryIdsRunButton')}
                </Button>
            </Stack>

            {message && stats ? (
                <Alert severity={hasIssues ? 'warning' : isDryRun ? 'info' : 'success'} sx={{ mb: 2 }}>
                    <Typography variant="body2" component="div" sx={{ mb: 1 }}>
                        {message}
                        {!isDryRun ? ` (${t('accountancy.migrateCategoryIdsApplied')})` : ''}
                    </Typography>
                    <Stack component="ul" sx={{ m: 0, pl: 2.5, typography: 'body2' }} spacing={0.5}>
                        <Box component="li">Категорий в справочнике: {stats.categories.total}</Box>
                        <CollectionStatsBlock title="Расходы" stats={stats.expenses} />
                        <CollectionStatsBlock title="Доходы" stats={stats.incomes} />
                        <CollectionStatsBlock title="Правила автоучёта" stats={stats.autoAccountingRules} />
                    </Stack>
                </Alert>
            ) : null}

            {stats ? (
                <>
                    <IssuesTable title="Категории без соответствия в справочнике" rows={stats.unmatched} />
                    <IssuesTable
                        title="Неоднозначное имя (несколько категорий с одним названием)"
                        rows={stats.ambiguous}
                        showIds
                    />
                </>
            ) : null}
        </Box>
    );
}

'use client';

import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';

type Preview = {
    arrivalFrom: string;
    matched: number;
    alreadyProcessed: number;
    eligible: number;
};

type Totals = {
    bookingsProcessed: number;
    expensesCreated: number;
    incomesCreated: number;
    rulesSkipped: number;
    errors: string[];
};

const EMPTY_TOTALS: Totals = {
    bookingsProcessed: 0,
    expensesCreated: 0,
    incomesCreated: 0,
    rulesSkipped: 0,
    errors: [],
};

export default function MigrateAutoTransactionsPage() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const hasAccess = isAdmin || isAccountant;

    const [preview, setPreview] = useState<Preview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [running, setRunning] = useState(false);
    const [totals, setTotals] = useState<Totals | null>(null);
    const tRef = useRef(t);
    tRef.current = t;

    const loadPreview = useCallback(async () => {
        setLoadingPreview(true);
        setPreviewError(null);
        try {
            const res = await fetch('/api/accountancy/migrate-auto-transactions');
            const data = (await res.json()) as Preview & { success?: boolean; message?: string };
            if (!res.ok || data.success === false) {
                setPreviewError(data.message || tRef.current('common.serverError'));
                setPreview(null);
                return;
            }
            setPreview({
                arrivalFrom: data.arrivalFrom,
                matched: data.matched,
                alreadyProcessed: data.alreadyProcessed,
                eligible: data.eligible,
            });
        } catch (error) {
            console.error(error);
            setPreviewError(tRef.current('common.serverError'));
        } finally {
            setLoadingPreview(false);
        }
    }, []);

    useEffect(() => {
        if (!hasAccess) return;
        void loadPreview();
    }, [hasAccess, loadPreview]);

    const handleRun = async () => {
        if (!hasAccess || running) return;
        setRunning(true);
        const next: Totals = { ...EMPTY_TOTALS, errors: [] };
        setTotals(next);
        let failed = false;
        try {
            let remaining = preview?.eligible ?? 1;
            while (remaining > 0) {
                const res = await fetch('/api/accountancy/migrate-auto-transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ limit: 20 }),
                });
                const data = (await res.json()) as Totals & {
                    success?: boolean;
                    message?: string;
                    remaining?: number;
                };
                if (!res.ok || data.success === false) {
                    failed = true;
                    setSnackbar({
                        open: true,
                        message: data.message || t('common.serverError'),
                        severity: 'error',
                    });
                    break;
                }
                next.bookingsProcessed += data.bookingsProcessed ?? 0;
                next.expensesCreated += data.expensesCreated ?? 0;
                next.incomesCreated += data.incomesCreated ?? 0;
                next.rulesSkipped += data.rulesSkipped ?? 0;
                if (Array.isArray(data.errors) && data.errors.length > 0) {
                    next.errors.push(...data.errors);
                }
                remaining = data.remaining ?? 0;
                setTotals({ ...next, errors: [...next.errors] });
                if ((data.bookingsProcessed ?? 0) === 0) break;
            }
            await loadPreview();
            if (!failed) {
                setSnackbar({
                    open: true,
                    message: `Готово. Расходов: ${next.expensesCreated}, доходов: ${next.incomesCreated}.`,
                    severity: next.errors.length > 0 ? 'warning' : 'success',
                });
            }
        } catch (error) {
            console.error(error);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setRunning(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4" sx={{ mb: 2 }}>
                    Автотранзакции с сентября 2026
                </Typography>
                <Alert severity="warning">{t('accountancy.noAccess')}</Alert>
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
                Автотранзакции с сентября 2026
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>
                Миграция берёт брони с заездом с 1 сентября 2026 и дальше (сентябрь, октябрь, ноябрь и
                последующие месяцы) и запускает автоучёт только по тем, для которых он ещё не
                запускался. Создаются транзакции, привязанные к брони. Правила категорий из групп без
                брони — «Общие расходы», «Расходы гостя», «Расходы HC», «Расходы владельца»,
                «Взаиморасчёты» — пропускаются.
            </Typography>

            {loadingPreview && !preview ? <CircularProgress size={24} /> : null}
            {previewError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {previewError}
                </Alert>
            ) : null}
            {preview ? (
                <Alert severity="info" sx={{ mb: 2, maxWidth: 720 }}>
                    <Stack component="ul" sx={{ m: 0, pl: 2.5 }} spacing={0.5}>
                        <li>Заезд с {preview.arrivalFrom}</li>
                        <li>Броней в этом диапазоне: {preview.matched}</li>
                        <li>Уже был автоучёт: {preview.alreadyProcessed}</li>
                        <li>Будет обработано: {preview.eligible}</li>
                    </Stack>
                </Alert>
            ) : null}

            <Button
                variant="contained"
                startIcon={running ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                onClick={() => void handleRun()}
                disabled={running || loadingPreview || (preview != null && preview.eligible === 0)}
            >
                {running ? 'Выполняется…' : 'Запустить автотранзакции'}
            </Button>

            {totals ? (
                <Alert
                    severity={totals.errors.length > 0 ? 'warning' : 'success'}
                    sx={{ mt: 2, maxWidth: 720 }}
                >
                    <Stack component="ul" sx={{ m: 0, pl: 2.5 }} spacing={0.5}>
                        <li>Обработано броней: {totals.bookingsProcessed}</li>
                        <li>Создано расходов: {totals.expensesCreated}</li>
                        <li>Создано доходов: {totals.incomesCreated}</li>
                        <li>Пропущено правил без привязки к брони: {totals.rulesSkipped}</li>
                    </Stack>
                    {totals.errors.length > 0 ? (
                        <Stack
                            component="ul"
                            sx={{ m: 0, mt: 1, pl: 2.5, maxHeight: 240, overflow: 'auto' }}
                        >
                            {totals.errors.map((err, index) => (
                                <li key={`${index}-${err}`}>{err}</li>
                            ))}
                        </Stack>
                    ) : null}
                </Alert>
            ) : null}
        </Box>
    );
}

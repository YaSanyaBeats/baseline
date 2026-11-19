'use client';

import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import type { FixAutoAccountingRoomsStats } from '@/lib/migrations/fixAutoAccountingRoomsNovember2026';

function StatsList({ stats, applied }: { stats: FixAutoAccountingRoomsStats; applied: boolean }) {
    const updatedLabel = applied ? 'Обновлено' : 'Будет обновлено';
    return (
        <Stack component="ul" sx={{ m: 0, pl: 2.5 }} spacing={0.5}>
            <li>Месяц отчёта: {stats.reportMonth}</li>
            <li>
                Автотранзакций: расходов {stats.expensesScanned}, доходов {stats.incomesScanned}
            </li>
            <li>
                {updatedLabel}: расходов {stats.expensesUpdated}, доходов {stats.incomesUpdated}
                {stats.childrenUpdated > 0 ? `, из них подтранзакций ${stats.childrenUpdated}` : ''}
            </li>
            <li>Уже на своей комнате: {stats.alreadyCorrect}</li>
            <li>Бронь не найдена: {stats.missingBooking}</li>
            <li>Комнату по брони определить нельзя: {stats.unresolvedRoom}</li>
        </Stack>
    );
}

export default function FixAutoAccountingRoomsPage() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const hasAccess = isAdmin || isAccountant;

    const [preview, setPreview] = useState<FixAutoAccountingRoomsStats | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [running, setRunning] = useState(false);
    const [applied, setApplied] = useState<FixAutoAccountingRoomsStats | null>(null);
    const tRef = useRef(t);
    tRef.current = t;

    const loadPreview = useCallback(async () => {
        setLoadingPreview(true);
        setPreviewError(null);
        try {
            const res = await fetch('/api/accountancy/fix-auto-accounting-rooms');
            const data = (await res.json()) as {
                success?: boolean;
                message?: string;
                stats?: FixAutoAccountingRoomsStats;
            };
            if (!res.ok || data.success === false || !data.stats) {
                setPreviewError(data.message || tRef.current('common.serverError'));
                setPreview(null);
                return;
            }
            setPreview(data.stats);
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
        setApplied(null);
        try {
            const res = await fetch('/api/accountancy/fix-auto-accounting-rooms', { method: 'POST' });
            const data = (await res.json()) as {
                success?: boolean;
                message?: string;
                stats?: FixAutoAccountingRoomsStats;
            };
            if (!res.ok || data.success === false) {
                setSnackbar({
                    open: true,
                    message: data.message || t('common.serverError'),
                    severity: 'error',
                });
                if (data.stats) setApplied(data.stats);
                return;
            }
            setApplied(data.stats ?? null);
            setSnackbar({
                open: true,
                message: data.message || t('common.success'),
                severity: data.stats && data.stats.errors.length > 0 ? 'warning' : 'success',
            });
            await loadPreview();
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
                    Комнаты автоучёта за ноябрь 2026
                </Typography>
                <Alert severity="warning">{t('accountancy.noAccess')}</Alert>
            </Box>
        );
    }

    const nothingToUpdate =
        preview != null && preview.expensesUpdated + preview.incomesUpdated === 0;

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
                Комнаты автоучёта за ноябрь 2026
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 760 }}>
                У мультиобъектов вроде 777 Beach Condo автоучёт записывал брони на первый тип номера
                (CD412): unitId в Beds24 повторяется у каждого типа. Миграция заново берёт тип из
                roomId брони и переносит автотранзакции с месяцем отчёта ноябрь 2026 на этот тип и
                его юнит. Записи, у которых объект учёта уже верный, не переименовываются. Поля «От
                кого» и «Кому» меняются только если правило подставляет комнату из брони. Суммы не
                пересчитываются. Повторный запуск пропускает уже исправленные записи.
            </Typography>

            {loadingPreview && !preview ? <CircularProgress size={24} /> : null}
            {previewError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {previewError}
                </Alert>
            ) : null}
            {preview ? (
                <Alert severity="info" sx={{ mb: 2, maxWidth: 760 }}>
                    <StatsList stats={preview} applied={false} />
                    {preview.moves.length > 0 ? (
                        <Stack
                            component="ul"
                            sx={{ m: 0, mt: 1, pl: 2.5, maxHeight: 240, overflow: 'auto' }}
                        >
                            {preview.moves.map((move) => (
                                <li key={`${move.fromObjectId}-${move.fromRoomName}-${move.toObjectId}-${move.toRoomName}`}>
                                    {move.fromRoomName ?? '—'} ({move.fromObjectId}) → {move.toRoomName} (
                                    {move.toObjectId}): {move.count}
                                </li>
                            ))}
                        </Stack>
                    ) : null}
                    {preview.unresolvedSamples.length > 0 ? (
                        <Stack component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                            {preview.unresolvedSamples.map((line) => (
                                <li key={line}>{line}</li>
                            ))}
                        </Stack>
                    ) : null}
                </Alert>
            ) : null}

            <Button
                variant="contained"
                startIcon={running ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                onClick={() => void handleRun()}
                disabled={running || loadingPreview || nothingToUpdate}
            >
                {running ? 'Выполняется…' : 'Перепривязать комнаты'}
            </Button>

            {applied ? (
                <Alert
                    severity={applied.errors.length > 0 ? 'warning' : 'success'}
                    sx={{ mt: 2, maxWidth: 760 }}
                >
                    <StatsList stats={applied} applied />
                    {applied.errors.length > 0 ? (
                        <Stack component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                            {applied.errors.map((err) => (
                                <li key={err}>{err}</li>
                            ))}
                        </Stack>
                    ) : null}
                </Alert>
            ) : null}
        </Box>
    );
}

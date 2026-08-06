'use client';

import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Stack,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/providers/UserProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useTranslation } from '@/i18n/useTranslation';
import type { MigrateMetadataPropertyIdsStats } from '@/lib/migrations/migrateMetadataPropertyIds';

type Preview = {
    ambiguousObjectMetadata: number;
    ambiguousRoomMetadata: number;
    roomMetadataWithoutRoomName: number;
};

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const hasAccess = isAdmin || isAccountant;

    const [loadingPreview, setLoadingPreview] = useState(true);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [stats, setStats] = useState<MigrateMetadataPropertyIdsStats | null>(null);
    const [failed, setFailed] = useState(false);

    const loadPreview = useCallback(async () => {
        setLoadingPreview(true);
        try {
            const res = await fetch('/api/objectRoomMetadata/migrate-property-ids');
            const data = await res.json();
            if (data.success && data.preview) {
                setPreview(data.preview);
            }
        } catch {
            setPreview(null);
        } finally {
            setLoadingPreview(false);
        }
    }, []);

    useEffect(() => {
        if (hasAccess) loadPreview();
    }, [hasAccess, loadPreview]);

    const handleMigrate = async () => {
        if (!hasAccess) return;
        setLoading(true);
        setMessage(null);
        setStats(null);
        setFailed(false);
        try {
            const res = await fetch('/api/objectRoomMetadata/migrate-property-ids', { method: 'POST' });
            const data = (await res.json()) as {
                success: boolean;
                message?: string;
                stats?: MigrateMetadataPropertyIdsStats;
            };
            if (data.success && data.stats) {
                setMessage(data.message ?? '');
                setStats(data.stats);
                setSnackbar({
                    open: true,
                    message: data.message ?? t('common.success'),
                    severity: data.stats.errors.length > 0 ? 'warning' : 'success',
                });
                await loadPreview();
            } else {
                setFailed(true);
                setMessage(data.message || t('common.serverError'));
                setSnackbar({ open: true, message: data.message || t('common.serverError'), severity: 'error' });
            }
        } catch {
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
                    Миграция метаданных объектов
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

    const totalAmbiguous =
        (preview?.ambiguousObjectMetadata ?? 0) + (preview?.ambiguousRoomMetadata ?? 0);

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 2 }}>
                Миграция метаданных: propertyId вместо roomType.id
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
                В коллекциях <strong>objectRoomMetadata_objects</strong> и{' '}
                <strong>objectRoomMetadata_rooms</strong> поле <code>objectId</code> должно быть ID property
                из Beds24 (<code>objects.id</code>), а не ID roomType. Старые записи с roomType.id сливаются с
                каноническими по паре propertyId + имя комнаты; дубликаты удаляются.
            </Alert>

            {loadingPreview ? (
                <CircularProgress size={28} sx={{ mb: 2 }} />
            ) : preview ? (
                <Alert severity={totalAmbiguous > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
                    <Stack spacing={0.5}>
                        <Typography variant="body2">
                            Неоднозначные objectId (roomType.id): метаданные объектов —{' '}
                            {preview.ambiguousObjectMetadata}, метаданные комнат —{' '}
                            {preview.ambiguousRoomMetadata}.
                        </Typography>
                        {preview.roomMetadataWithoutRoomName > 0 ? (
                            <Typography variant="body2">
                                Записей комнат без имени (только roomId):{' '}
                                {preview.roomMetadataWithoutRoomName}. Сначала выполните{' '}
                                <Link href="/dashboard/accountancy/migration">миграцию unit id → имя</Link>.
                            </Typography>
                        ) : null}
                    </Stack>
                </Alert>
            ) : null}

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <Button
                    variant="contained"
                    onClick={handleMigrate}
                    disabled={loading || loadingPreview}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                >
                    {loading ? 'Выполняется…' : 'Запустить миграцию'}
                </Button>
                <Link href="/dashboard">
                    <Button variant="outlined" startIcon={<ArrowBackIcon />} disabled={loading}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>

            {message && !failed ? (
                <Alert severity={stats?.errors.length ? 'warning' : 'success'} sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ mb: stats ? 1 : 0 }}>
                        {message}
                    </Typography>
                    {stats ? (
                        <Stack component="ul" sx={{ m: 0, pl: 2.5, typography: 'body2' }} spacing={0.5}>
                            <li>
                                objectRoomMetadata_objects: просмотрено {stats.objectMetadata.scanned}, слито{' '}
                                {stats.objectMetadata.merged}, переключено {stats.objectMetadata.rekeyed}
                            </li>
                            <li>
                                objectRoomMetadata_rooms: просмотрено {stats.roomMetadata.scanned}, слито{' '}
                                {stats.roomMetadata.merged}, переключено {stats.roomMetadata.rekeyed}, roomId→имя{' '}
                                {stats.roomMetadata.roomIdResolved}
                            </li>
                        </Stack>
                    ) : null}
                </Alert>
            ) : null}

            {failed && message ? <Alert severity="error">{message}</Alert> : null}

            {stats && stats.errors.length > 0 ? (
                <Alert severity="warning">
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Предупреждения ({stats.errors.length})
                    </Typography>
                    <Stack component="ul" sx={{ m: 0, pl: 2.5, typography: 'body2', maxHeight: 240, overflow: 'auto' }}>
                        {stats.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                        ))}
                    </Stack>
                </Alert>
            ) : null}
        </Box>
    );
}

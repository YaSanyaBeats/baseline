'use client';

import { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import { useTranslation } from '@/i18n/useTranslation';
import { useUser } from '@/providers/UserProvider';
import { apiClient, getApiUrl } from '@/lib/api-client';

type SkipRow = {
    bookingId: number | null;
    guestName: string;
    arrival: string | null;
    departure: string | null;
    reason: 'before_window' | 'frozen_existing' | 'closed_period';
    reportMonth?: string;
    roomKey?: string;
};

type JournalEntry = {
    id: string;
    createdAt: string;
    source: 'manual' | 'daily';
    status: 'success' | 'error';
    incoming: number;
    kept: number;
    replaced: number;
    preservedClosed: number;
    skippedTotal: number;
    error: string | null;
    skipped: SkipRow[];
};

function formatWhen(value: string, locale: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function skipReasonText(skip: SkipRow, t: (key: string) => string): string {
    if (skip.reason === 'closed_period') {
        const month = skip.reportMonth ?? '';
        const room = skip.roomKey ? `, ${skip.roomKey}` : '';
        return t('beds24SyncJournal.reasonClosed').replace('{{month}}', month).replace('{{room}}', room);
    }
    if (skip.reason === 'frozen_existing') return t('beds24SyncJournal.reasonFrozen');
    return t('beds24SyncJournal.reasonBeforeWindow');
}

export default function Beds24SyncJournalPage() {
    const { t, language } = useTranslation();
    const { isAdmin } = useUser();
    const locale = language === 'ru' ? 'ru-RU' : 'en-US';
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isAdmin) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        apiClient
            .get(getApiUrl('beds24/sync-journal'))
            .then((res) => {
                if (cancelled) return;
                if (res.data?.success) setEntries(res.data.entries ?? []);
                else setError('load');
            })
            .catch(() => {
                if (!cancelled) setError('load');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isAdmin]);

    if (!isAdmin) {
        return <Alert severity="warning">{t('beds24SyncJournal.noAccess')}</Alert>;
    }

    return (
        <Stack spacing={2}>
            <Box>
                <Typography variant="h5">{t('beds24SyncJournal.title')}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {t('beds24SyncJournal.hint')}
                </Typography>
            </Box>
            {error ? <Alert severity="error">{t('beds24SyncJournal.loadError')}</Alert> : null}
            {loading ? (
                <Typography color="text.secondary">{t('beds24SyncJournal.loading')}</Typography>
            ) : entries.length === 0 ? (
                <Typography color="text.secondary">{t('beds24SyncJournal.empty')}</Typography>
            ) : (
                entries.map((entry) => (
                    <Paper key={entry.id} sx={{ p: 2 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                            <Typography variant="subtitle1">{formatWhen(entry.createdAt, locale)}</Typography>
                            <Chip
                                size="small"
                                label={
                                    entry.source === 'daily'
                                        ? t('beds24SyncJournal.sourceDaily')
                                        : t('beds24SyncJournal.sourceManual')
                                }
                            />
                            <Chip
                                size="small"
                                color={entry.status === 'error' ? 'error' : 'success'}
                                label={
                                    entry.status === 'error'
                                        ? t('beds24SyncJournal.error')
                                        : t('beds24SyncJournal.success')
                                }
                            />
                        </Stack>
                        {entry.status === 'error' && entry.error ? (
                            <Typography color="error" variant="body2" sx={{ mb: 1 }}>
                                {entry.error}
                            </Typography>
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                {t('beds24SyncJournal.summary')
                                    .replace('{{incoming}}', String(entry.incoming))
                                    .replace('{{replaced}}', String(entry.replaced))
                                    .replace('{{kept}}', String(entry.kept))
                                    .replace('{{skipped}}', String(entry.skippedTotal))
                                    .replace('{{preserved}}', String(entry.preservedClosed))}
                            </Typography>
                        )}
                        {entry.skipped.length > 0 ? (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('beds24SyncJournal.booking')}</TableCell>
                                        <TableCell>{t('beds24SyncJournal.dates')}</TableCell>
                                        <TableCell>{t('beds24SyncJournal.reason')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {entry.skipped.map((skip, index) => (
                                        <TableRow key={`${entry.id}-${skip.bookingId ?? 'x'}-${index}`}>
                                            <TableCell>
                                                {skip.bookingId != null ? `#${skip.bookingId}` : '—'}
                                                {skip.guestName ? ` ${skip.guestName}` : ''}
                                            </TableCell>
                                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                                {(skip.arrival ?? '—') + ' — ' + (skip.departure ?? '—')}
                                            </TableCell>
                                            <TableCell>{skipReasonText(skip, t)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : entry.status === 'success' && entry.skippedTotal === 0 ? (
                            <Typography variant="body2">{t('beds24SyncJournal.noSkips')}</Typography>
                        ) : null}
                        {entry.skippedTotal > entry.skipped.length ? (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                {t('beds24SyncJournal.skippedTruncated')
                                    .replace('{{shown}}', String(entry.skipped.length))
                                    .replace('{{total}}', String(entry.skippedTotal))}
                            </Typography>
                        ) : null}
                    </Paper>
                ))
            )}
        </Stack>
    );
}

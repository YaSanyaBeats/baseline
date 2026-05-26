'use client';

import {
    Alert,
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useObjects } from '@/providers/ObjectsProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { migrateTransactionsToRoom } from '@/lib/accountancyMigrateRoom';
import { getApiErrorMessage } from '@/lib/axiosResponseMessage';

type RoomOption = {
    objectId: number;
    roomName: string;
    label: string;
};

function encodeRoomKey(objectId: number, roomName: string): string {
    return `${objectId}\u0001${roomName}`;
}

function decodeRoomKey(key: string): { objectId: number; roomName: string } | null {
    const idx = key.indexOf('\u0001');
    if (idx < 0) return null;
    const objectId = Number(key.slice(0, idx));
    const roomName = key.slice(idx + 1);
    if (!Number.isFinite(objectId) || !roomName) return null;
    return { objectId, roomName };
}

function stableRoomLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

export default function MigrateTransactionsRoomPage() {
    const { t } = useTranslation();
    const { objects } = useObjects();
    const { setSnackbar } = useSnackbar();
    const { isAdmin, isAccountant } = useUser();

    const [reportMonth, setReportMonth] = useState('');
    const [sourceRoomKey, setSourceRoomKey] = useState('');
    const [destinationRoomKey, setDestinationRoomKey] = useState('');
    const [onlyBookingLinked, setOnlyBookingLinked] = useState(false);
    const [loading, setLoading] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [result, setResult] = useState<{ expensesUpdated: number; incomesUpdated: number } | null>(
        null,
    );

    const hasAccess = isAdmin || isAccountant;

    const roomOptions = useMemo((): RoomOption[] => {
        const options: RoomOption[] = [];
        for (const object of objects) {
            for (const room of object.roomTypes ?? []) {
                const roomName = stableRoomLabel(room);
                options.push({
                    objectId: object.id,
                    roomName,
                    label: `${object.name}: ${roomName}`,
                });
            }
        }
        return options.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    }, [objects]);

    const sourceRoom = useMemo(() => decodeRoomKey(sourceRoomKey), [sourceRoomKey]);

    const destinationRoomOptions = useMemo(() => {
        if (!sourceRoom) return [];
        return roomOptions.filter(
            (opt) =>
                opt.objectId === sourceRoom.objectId &&
                !(opt.objectId === sourceRoom.objectId && opt.roomName === sourceRoom.roomName),
        );
    }, [roomOptions, sourceRoom]);

    const monthOptions = useMemo(() => {
        const options: { value: string; label: string }[] = [];
        const now = new Date();
        for (let i = 0; i < 24; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const value = `${y}-${String(m).padStart(2, '0')}`;
            const monthName = t(`accountancy.months.${m}`);
            options.push({ value, label: `${monthName} ${y}` });
        }
        return options;
    }, [t]);

    const canSubmit = Boolean(reportMonth && sourceRoomKey && destinationRoomKey);

    const handleSubmit = async () => {
        setConfirmOpen(false);
        const source = decodeRoomKey(sourceRoomKey);
        const destination = decodeRoomKey(destinationRoomKey);
        if (!source || !destination || !reportMonth) return;

        setLoading(true);
        setResult(null);
        try {
            const res = await migrateTransactionsToRoom({
                reportMonth,
                objectId: source.objectId,
                sourceRoomName: source.roomName,
                destinationRoomName: destination.roomName,
                onlyBookingLinked,
            });
            if (res.success) {
                setResult({
                    expensesUpdated: res.expensesUpdated ?? 0,
                    incomesUpdated: res.incomesUpdated ?? 0,
                });
                setSnackbar({
                    open: true,
                    message: res.message ?? t('common.success'),
                    severity: 'success',
                });
            } else {
                setSnackbar({
                    open: true,
                    message: res.message || t('common.serverError'),
                    severity: 'error',
                });
            }
        } catch (err) {
            setSnackbar({
                open: true,
                message: getApiErrorMessage(err, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setLoading(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">Миграция транзакций в другую комнату</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 1 }}>
                Миграция транзакций в другую комнату
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Все расходы и доходы за выбранный месяц отчёта с указанной исходной комнатой будут
                перенесены в комнату назначения. Если в полях «От кого» или «Кому» указана исходная
                комната, она также будет заменена.
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, maxWidth: 560 }}>
                <Stack spacing={2}>
                    <FormControl fullWidth required>
                        <InputLabel id="migrate-report-month-label">{t('accountancy.reportMonth')}</InputLabel>
                        <Select
                            labelId="migrate-report-month-label"
                            value={reportMonth}
                            label={t('accountancy.reportMonth')}
                            onChange={(e) => setReportMonth(e.target.value)}
                        >
                            <MenuItem value="">—</MenuItem>
                            {monthOptions.map((o) => (
                                <MenuItem key={o.value} value={o.value}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl fullWidth required>
                        <InputLabel id="migrate-source-room-label">Исходная комната</InputLabel>
                        <Select
                            labelId="migrate-source-room-label"
                            value={sourceRoomKey}
                            label="Исходная комната"
                            onChange={(e) => {
                                setSourceRoomKey(e.target.value);
                                setDestinationRoomKey('');
                                setResult(null);
                            }}
                        >
                            <MenuItem value="">—</MenuItem>
                            {roomOptions.map((opt) => (
                                <MenuItem
                                    key={encodeRoomKey(opt.objectId, opt.roomName)}
                                    value={encodeRoomKey(opt.objectId, opt.roomName)}
                                >
                                    {opt.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl fullWidth required disabled={!sourceRoom}>
                        <InputLabel id="migrate-destination-room-label">Комната назначения</InputLabel>
                        <Select
                            labelId="migrate-destination-room-label"
                            value={destinationRoomKey}
                            label="Комната назначения"
                            onChange={(e) => {
                                setDestinationRoomKey(e.target.value);
                                setResult(null);
                            }}
                        >
                            <MenuItem value="">—</MenuItem>
                            {destinationRoomOptions.map((opt) => (
                                <MenuItem
                                    key={encodeRoomKey(opt.objectId, opt.roomName)}
                                    value={encodeRoomKey(opt.objectId, opt.roomName)}
                                >
                                    {opt.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={onlyBookingLinked}
                                onChange={(e) => {
                                    setOnlyBookingLinked(e.target.checked);
                                    setResult(null);
                                }}
                            />
                        }
                        label="Только привязанные к броням"
                    />

                    <Button
                        variant="contained"
                        color="warning"
                        startIcon={<SwapHorizIcon />}
                        disabled={loading || !canSubmit}
                        onClick={() => setConfirmOpen(true)}
                    >
                        Перенести транзакции
                    </Button>
                </Stack>
            </Paper>

            {result ? (
                <Alert severity="success" sx={{ mt: 2, maxWidth: 560 }}>
                    Обновлено расходов: {result.expensesUpdated}, доходов: {result.incomesUpdated}.
                </Alert>
            ) : null}

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>Подтверждение миграции</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        Перенести все транзакции за{' '}
                        <strong>{reportMonth || '—'}</strong> из комнаты{' '}
                        <strong>
                            {roomOptions.find(
                                (o) => encodeRoomKey(o.objectId, o.roomName) === sourceRoomKey,
                            )?.label ?? '—'}
                        </strong>{' '}
                        в комнату{' '}
                        <strong>
                            {destinationRoomOptions.find(
                                (o) => encodeRoomKey(o.objectId, o.roomName) === destinationRoomKey,
                            )?.label ?? '—'}
                        </strong>
                        {onlyBookingLinked ? ' (только транзакции с бронью)' : ''}?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} color="warning" variant="contained" disabled={loading}>
                        Перенести
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

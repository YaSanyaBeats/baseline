'use client';

import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useObjects } from '@/providers/ObjectsProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { renameRoom } from '@/lib/renameRoom';
import { getApiErrorMessage } from '@/lib/axiosResponseMessage';
import type { RenameRoomStats } from '@/lib/server/renameRoom';

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

export default function RenameRoomsPage() {
    const { t } = useTranslation();
    const { objects, refreshObjects } = useObjects();
    const { setSnackbar } = useSnackbar();
    const { isAdmin } = useUser();

    const [roomKey, setRoomKey] = useState('');
    const [newRoomName, setNewRoomName] = useState('');
    const [loading, setLoading] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [result, setResult] = useState<RenameRoomStats | null>(null);

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

    const selectedRoom = useMemo(() => decodeRoomKey(roomKey), [roomKey]);

    const canSubmit = Boolean(
        selectedRoom &&
            newRoomName.trim() &&
            newRoomName.trim() !== selectedRoom.roomName,
    );

    const handleSubmit = async () => {
        setConfirmOpen(false);
        if (!selectedRoom || !newRoomName.trim()) return;

        setLoading(true);
        setResult(null);
        try {
            const res = await renameRoom({
                objectId: selectedRoom.objectId,
                oldRoomName: selectedRoom.roomName,
                newRoomName: newRoomName.trim(),
            });
            if (res.success) {
                setResult({
                    objectsUpdated: res.objectsUpdated ?? false,
                    internalObjectsUpdated: res.internalObjectsUpdated ?? false,
                    expensesUpdated: res.expensesUpdated ?? 0,
                    incomesUpdated: res.incomesUpdated ?? 0,
                    objectRoomMetadataRoomsUpdated: res.objectRoomMetadataRoomsUpdated ?? 0,
                    autoAccountingRulesUpdated: res.autoAccountingRulesUpdated ?? 0,
                    accountancyClosedMonthsUpdated: res.accountancyClosedMonthsUpdated ?? 0,
                    holyCowExpenseShareRatesUpdated: res.holyCowExpenseShareRatesUpdated ?? 0,
                    usersUpdated: res.usersUpdated ?? 0,
                });
                await refreshObjects();
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

    if (!isAdmin) {
        return (
            <Box>
                <Typography variant="h4">{t('options.renameRoomsTitle')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/options">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 1 }}>
                {t('options.renameRoomsTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {t('options.renameRoomsDescription')}
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, maxWidth: 560 }}>
                <Stack spacing={2}>
                    <FormControl fullWidth required>
                        <InputLabel id="rename-room-select-label">
                            {t('options.renameRoomsSelectRoom')}
                        </InputLabel>
                        <Select
                            labelId="rename-room-select-label"
                            value={roomKey}
                            label={t('options.renameRoomsSelectRoom')}
                            onChange={(e) => {
                                setRoomKey(e.target.value);
                                setNewRoomName('');
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

                    <TextField
                        fullWidth
                        required
                        label={t('options.renameRoomsNewName')}
                        value={newRoomName}
                        onChange={(e) => {
                            setNewRoomName(e.target.value);
                            setResult(null);
                        }}
                        disabled={!selectedRoom}
                    />

                    <Button
                        variant="contained"
                        startIcon={<DriveFileRenameOutlineIcon />}
                        disabled={loading || !canSubmit}
                        onClick={() => setConfirmOpen(true)}
                    >
                        {t('options.renameRoomsSubmit')}
                    </Button>
                </Stack>
            </Paper>

            {result ? (
                <Alert severity="success" sx={{ mt: 2, maxWidth: 560 }}>
                    {t('options.renameRoomsResult')
                        .replace('{{expenses}}', String(result.expensesUpdated))
                        .replace('{{incomes}}', String(result.incomesUpdated))
                        .replace('{{metadata}}', String(result.objectRoomMetadataRoomsUpdated))
                        .replace('{{rules}}', String(result.autoAccountingRulesUpdated))
                        .replace('{{closedMonths}}', String(result.accountancyClosedMonthsUpdated))
                        .replace('{{rates}}', String(result.holyCowExpenseShareRatesUpdated))
                        .replace('{{users}}', String(result.usersUpdated))}
                </Alert>
            ) : null}

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>{t('options.renameRoomsConfirmTitle')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t('options.renameRoomsConfirmMessage')
                            .replace('{{oldName}}', selectedRoom?.roomName ?? '—')
                            .replace('{{newName}}', newRoomName.trim() || '—')
                            .replace(
                                '{{label}}',
                                roomOptions.find(
                                    (o) => encodeRoomKey(o.objectId, o.roomName) === roomKey,
                                )?.label ?? '—',
                            )}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={loading}>
                        {t('options.renameRoomsSubmit')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

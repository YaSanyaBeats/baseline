'use client';

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Stack,
} from '@mui/material';
import { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import type { Object as ObjectType, Room, RoomLevel } from '@/lib/types';
import type { CommissionSchemeId } from '@/lib/commissionCalculation';

const SCHEMES: { id: CommissionSchemeId; labelKey: string }[] = [
    { id: 1, labelKey: 'accountancy.commission.scheme1' },
    { id: 2, labelKey: 'accountancy.commission.scheme2' },
    { id: 3, labelKey: 'accountancy.commission.scheme3' },
    { id: 4, labelKey: 'accountancy.commission.scheme4' },
];

interface RoomEditDialogProps {
    open: boolean;
    onClose: () => void;
    object: ObjectType | null;
    room: Room | null;
    onSave: (
        objectId: number,
        roomId: number,
        data: {
            bedrooms?: number;
            bathrooms?: number;
            livingRoomSofas?: number;
            kitchen?: 'yes' | 'no';
            level?: RoomLevel;
            commissionSchemeId?: CommissionSchemeId;
        }
    ) => Promise<void>;
}

export default function RoomEditDialog({ open, onClose, object, room, onSave }: RoomEditDialogProps) {
    const { t } = useTranslation();
    const [bedrooms, setBedrooms] = useState<string>('');
    const [bathrooms, setBathrooms] = useState<string>('');
    const [livingRoomSofas, setLivingRoomSofas] = useState<string>('');
    const [kitchen, setKitchen] = useState<'yes' | 'no' | ''>('');
    const [level, setLevel] = useState<RoomLevel | ''>('');
    const [commissionSchemeId, setCommissionSchemeId] = useState<CommissionSchemeId | ''>('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (room) {
            setBedrooms(room.bedrooms !== undefined ? String(room.bedrooms) : '');
            setBathrooms(room.bathrooms !== undefined ? String(room.bathrooms) : '');
            setLivingRoomSofas(room.livingRoomSofas !== undefined ? String(room.livingRoomSofas) : '');
            setKitchen(room.kitchen ?? '');
            setLevel(room.level ?? '');
            setCommissionSchemeId(room.commissionSchemeId ?? '');
        }
    }, [room]);

    const handleSave = async () => {
        if (!object || !room) return;
        setSaving(true);
        try {
            await onSave(object.id, room.id, {
                bedrooms: bedrooms !== '' ? parseInt(bedrooms, 10) : undefined,
                bathrooms: bathrooms !== '' ? parseInt(bathrooms, 10) : undefined,
                livingRoomSofas: livingRoomSofas !== '' ? parseInt(livingRoomSofas, 10) : undefined,
                kitchen: kitchen || undefined,
                level: level || undefined,
                commissionSchemeId: commissionSchemeId || undefined,
            });
            onClose();
        } finally {
            setSaving(false);
        }
    };

    if (!object || !room) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{t('dashboard.editRoom')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                        label={t('dashboard.bedrooms')}
                        type="number"
                        inputProps={{ min: 0, step: 1 }}
                        value={bedrooms}
                        onChange={(e) => setBedrooms(e.target.value)}
                        fullWidth
                    />
                    <TextField
                        label={t('dashboard.bathrooms')}
                        type="number"
                        inputProps={{ min: 0, step: 1 }}
                        value={bathrooms}
                        onChange={(e) => setBathrooms(e.target.value)}
                        fullWidth
                    />
                    <TextField
                        label={t('dashboard.livingRoomSofas')}
                        type="number"
                        inputProps={{ min: 0, step: 1 }}
                        value={livingRoomSofas}
                        onChange={(e) => setLivingRoomSofas(e.target.value)}
                        fullWidth
                    />
                    <FormControl fullWidth>
                        <InputLabel>{t('dashboard.kitchen')}</InputLabel>
                        <Select
                            value={kitchen}
                            label={t('dashboard.kitchen')}
                            onChange={(e) => setKitchen(e.target.value as 'yes' | 'no' | '')}
                        >
                            <MenuItem value="">—</MenuItem>
                            <MenuItem value="yes">{t('dashboard.kitchenYes')}</MenuItem>
                            <MenuItem value="no">{t('dashboard.kitchenNo')}</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl fullWidth>
                        <InputLabel>{t('dashboard.level')}</InputLabel>
                        <Select
                            value={level}
                            label={t('dashboard.level')}
                            onChange={(e) => setLevel(e.target.value as RoomLevel | '')}
                        >
                            <MenuItem value="">—</MenuItem>
                            <MenuItem value="economy">{t('dashboard.levelEconomy')}</MenuItem>
                            <MenuItem value="comfort">{t('dashboard.levelComfort')}</MenuItem>
                            <MenuItem value="premium">{t('dashboard.levelPremium')}</MenuItem>
                            <MenuItem value="lux">{t('dashboard.levelLux')}</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl fullWidth>
                        <InputLabel>{t('accountancy.commission.scheme')}</InputLabel>
                        <Select
                            value={commissionSchemeId}
                            label={t('accountancy.commission.scheme')}
                            onChange={(e) => setCommissionSchemeId(e.target.value as CommissionSchemeId | '')}
                        >
                            <MenuItem value="">—</MenuItem>
                            {SCHEMES.map((s) => (
                                <MenuItem key={s.id} value={s.id}>
                                    {t(s.labelKey)}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>
                    {t('common.cancel')}
                </Button>
                <Button onClick={handleSave} variant="contained" disabled={saving}>
                    {saving ? t('common.saving') : t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

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
import type { Object as ObjectEntity, ObjectType } from '@/lib/types';

interface ObjectEditDialogProps {
    open: boolean;
    onClose: () => void;
    object: ObjectEntity | null;
    onSave: (objectId: number, data: { district?: string; objectType?: ObjectType }) => Promise<void>;
}

export default function ObjectEditDialog({ open, onClose, object, onSave }: ObjectEditDialogProps) {
    const { t } = useTranslation();
    const [district, setDistrict] = useState('');
    const [objectType, setObjectType] = useState<ObjectType | ''>('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (object) {
            setDistrict(object.district ?? '');
            setObjectType(object.objectType ?? '');
        }
    }, [object]);

    const handleSave = async () => {
        if (!object) return;
        setSaving(true);
        try {
            await onSave(object.id, {
                district: district.trim() || undefined,
                objectType: objectType || undefined,
            });
            onClose();
        } finally {
            setSaving(false);
        }
    };

    if (!object) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{t('dashboard.editObject')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                        label={t('dashboard.district')}
                        value={district}
                        onChange={(e) => setDistrict(e.target.value)}
                        fullWidth
                    />
                    <FormControl fullWidth>
                        <InputLabel>{t('dashboard.objectType')}</InputLabel>
                        <Select
                            value={objectType}
                            label={t('dashboard.objectType')}
                            onChange={(e) => setObjectType(e.target.value as ObjectType | '')}
                        >
                            <MenuItem value="">—</MenuItem>
                            <MenuItem value="apartments">{t('dashboard.objectTypeApartments')}</MenuItem>
                            <MenuItem value="villa">{t('dashboard.objectTypeVilla')}</MenuItem>
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

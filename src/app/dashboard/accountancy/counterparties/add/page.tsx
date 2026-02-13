'use client';

import {
    Box,
    Button,
    Stack,
    TextField,
    Typography,
    Alert,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useState } from 'react';
import { UserObject } from '@/lib/types';
import { addCounterparty } from '@/lib/counterparties';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useRouter } from 'next/navigation';
import RoomsMultiSelect from '@/components/objectsMultiSelect/RoomsMultiSelect';

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();

    const [name, setName] = useState('');
    const [roomLinks, setRoomLinks] = useState<UserObject[]>([]);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const hasAccess = isAdmin || isAccountant;

    const validate = (): boolean => {
        const validationErrors: Record<string, string> = {};
        if (!name.trim()) {
            validationErrors.name = t('accountancy.counterparty.nameRequired');
        }
        setErrors(validationErrors);
        if (Object.keys(validationErrors).length > 0) {
            setSnackbar({
                open: true,
                message: t('accountancy.formErrors'),
                severity: 'error',
            });
            return false;
        }
        return true;
    };

    const handleSubmit = async () => {
        if (!validate()) return;

        setLoading(true);
        try {
            const res = await addCounterparty({
                name: name.trim(),
                roomLinks,
                comment: comment.trim(),
            });
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                router.push('/dashboard/accountancy/counterparties');
            }
        } catch (error) {
            console.error('Error adding counterparty:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setLoading(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.counterparty.add')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy/counterparties">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('accountancy.counterparty.add')}
            </Typography>

            <Stack direction="column" spacing={2} sx={{ maxWidth: 500 }}>
                <TextField
                    label={t('accountancy.counterparty.name')}
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    error={!!errors.name}
                    helperText={errors.name}
                    fullWidth
                    required
                />
                <Box>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        {t('accountancy.counterparty.rooms')}
                    </Typography>
                    <RoomsMultiSelect
                        value={roomLinks}
                        onChange={setRoomLinks}
                        label={t('accountancy.counterparty.roomsSelect')}
                        multiple={true}
                    />
                </Box>
                <TextField
                    label={t('accountancy.comment')}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    multiline
                    minRows={2}
                    fullWidth
                />
                <Stack direction="row" spacing={2} mt={2}>
                    <Link href="/dashboard/accountancy/counterparties">
                        <Button variant="outlined" startIcon={<ArrowBackIcon />}>
                            {t('common.cancel')}
                        </Button>
                    </Link>
                    <Button
                        variant="contained"
                        endIcon={<SendIcon />}
                        onClick={handleSubmit}
                        disabled={loading}
                    >
                        {t('common.send')}
                    </Button>
                </Stack>
            </Stack>
        </Box>
    );
}

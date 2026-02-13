'use client';

import {
    Box,
    Button,
    Stack,
    TextField,
    Typography,
    Alert,
    CircularProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Counterparty, UserObject } from '@/lib/types';
import { getCounterparties, updateCounterparty } from '@/lib/counterparties';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useRouter, useParams } from 'next/navigation';
import RoomsMultiSelect from '@/components/objectsMultiSelect/RoomsMultiSelect';

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const params = useParams();
    const counterpartyId = params?.id as string;
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();

    const [name, setName] = useState('');
    const [roomLinks, setRoomLinks] = useState<UserObject[]>([]);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess || !counterpartyId) return;

        const load = async () => {
            setLoadingData(true);
            try {
                const list = await getCounterparties();
                const found = list.find((c) => c._id === counterpartyId);
                if (found) {
                    setName(found.name);
                    setRoomLinks(found.roomLinks ?? []);
                    setComment(found.comment ?? '');
                } else {
                    setSnackbar({
                        open: true,
                        message: t('accountancy.counterparty.notFound'),
                        severity: 'error',
                    });
                    router.push('/dashboard/accountancy/counterparties');
                }
            } catch (error) {
                console.error('Error loading counterparty:', error);
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
                router.push('/dashboard/accountancy/counterparties');
            } finally {
                setLoadingData(false);
            }
        };

        load();
    }, [hasAccess, counterpartyId, router]);

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
        if (!validate() || !counterpartyId) return;

        setLoading(true);
        try {
            const res = await updateCounterparty({
                _id: counterpartyId,
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
            console.error('Error updating counterparty:', error);
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
                <Typography variant="h4">{t('accountancy.counterparty.edit')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    if (loadingData) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress />
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
                {t('accountancy.counterparty.edit')}
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
                        {t('common.save')}
                    </Button>
                </Stack>
            </Stack>
        </Box>
    );
}

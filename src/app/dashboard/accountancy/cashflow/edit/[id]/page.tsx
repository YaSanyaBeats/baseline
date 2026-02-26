'use client';

import {
    Box,
    Button,
    Stack,
    TextField,
    Typography,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    CircularProgress,
    OutlinedInput,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cashflow, CashflowType, UserObject } from '@/lib/types';
import { getCashflows, updateCashflow } from '@/lib/cashflows';
import { getCounterparties } from '@/lib/counterparties';
import { getUsers } from '@/lib/users';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useRouter, useParams } from 'next/navigation';
import RoomsMultiSelect from '@/components/objectsMultiSelect/RoomsMultiSelect';

const CASHFLOW_TYPES: CashflowType[] = ['company', 'employee', 'room', 'object', 'premium', 'other'];
const TYPE_KEYS: Record<CashflowType, string> = {
    company: 'typeCompany',
    employee: 'typeEmployee',
    room: 'typeRoom',
    object: 'typeObject',
    premium: 'typePremium',
    other: 'typeOther',
};

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const params = useParams();
    const cashflowId = params?.id as string;
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();

    const [name, setName] = useState('');
    const [type, setType] = useState<CashflowType>('other');
    const [roomLinks, setRoomLinks] = useState<UserObject[]>([]);
    const [userId, setUserId] = useState('');
    const [counterpartyIds, setCounterpartyIds] = useState<string[]>([]);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [users, setUsers] = useState<{ _id: string; name: string }[]>([]);

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess) return;
        Promise.all([getCounterparties(), getUsers()])
            .then(([cps, us]) => {
                setCounterparties(cps.map((c) => ({ _id: c._id!, name: c.name })));
                setUsers(us.map((u) => ({ _id: u._id!, name: u.name || '' })));
            })
            .catch((err) => console.error('Error loading counterparties/users:', err));
    }, [hasAccess]);

    useEffect(() => {
        if (!hasAccess || !cashflowId) return;

        const load = async () => {
            setLoadingData(true);
            try {
                const list = await getCashflows();
                const found = list.find((c) => c._id === cashflowId);
                if (found) {
                    setName(found.name);
                    setType(found.type);
                    setRoomLinks(found.roomLinks ?? []);
                    setUserId(found.userId ?? '');
                    setCounterpartyIds(found.counterpartyIds ?? []);
                    setComment(found.comment ?? '');
                } else {
                    setSnackbar({
                        open: true,
                        message: t('accountancy.cashflow.notFound'),
                        severity: 'error',
                    });
                    router.push('/dashboard/accountancy/cashflow');
                }
            } catch (error) {
                console.error('Error loading cashflow:', error);
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
                router.push('/dashboard/accountancy/cashflow');
            } finally {
                setLoadingData(false);
            }
        };

        load();
    }, [hasAccess, cashflowId, router]);

    const validate = (): boolean => {
        const validationErrors: Record<string, string> = {};
        if (!name.trim()) {
            validationErrors.name = t('accountancy.cashflow.nameRequired');
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
        if (!validate() || !cashflowId) return;

        setLoading(true);
        try {
            const res = await updateCashflow({
                _id: cashflowId,
                name: name.trim(),
                type,
                roomLinks,
                ...(userId.trim() && { userId: userId.trim() }),
                counterpartyIds,
                comment: comment.trim(),
            });
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                router.push('/dashboard/accountancy/cashflow');
            }
        } catch (error) {
            console.error('Error updating cashflow:', error);
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
                <Typography variant="h4">{t('accountancy.cashflow.edit')}</Typography>
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
                <Link href="/dashboard/accountancy/cashflow">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('accountancy.cashflow.edit')}
            </Typography>

            <Stack direction="column" spacing={2} sx={{ maxWidth: 500 }}>
                <TextField
                    label={t('accountancy.cashflow.name')}
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
                <FormControl fullWidth required>
                    <InputLabel>{t('accountancy.cashflow.type')}</InputLabel>
                    <Select
                        value={type}
                        onChange={(e) => setType(e.target.value as CashflowType)}
                        label={t('accountancy.cashflow.type')}
                    >
                        {CASHFLOW_TYPES.map((tp) => (
                            <MenuItem key={tp} value={tp}>
                                {t(`accountancy.cashflow.${TYPE_KEYS[tp]}`)}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Box>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        {t('accountancy.cashflow.rooms')}
                    </Typography>
                    <RoomsMultiSelect
                        value={roomLinks}
                        onChange={setRoomLinks}
                        label={t('accountancy.cashflow.roomsSelect')}
                        multiple={true}
                    />
                </Box>
                <Box>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        {t('accountancy.cashflow.counterparties')}
                    </Typography>
                    <FormControl fullWidth size="small">
                        <InputLabel>{t('accountancy.cashflow.counterpartiesSelect')}</InputLabel>
                        <Select
                            multiple
                            value={counterpartyIds}
                            onChange={(e) => setCounterpartyIds(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                            input={<OutlinedInput label={t('accountancy.cashflow.counterpartiesSelect')} />}
                            renderValue={(selected) => selected.map((id) => counterparties.find((c) => c._id === id)?.name ?? id).join(', ')}
                        >
                            {counterparties.map((cp) => (
                                <MenuItem key={cp._id} value={cp._id}>
                                    {cp.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>
                <FormControl fullWidth size="small">
                    <InputLabel>{t('accountancy.cashflow.employee')}</InputLabel>
                    <Select
                        value={userId}
                        onChange={(e) => setUserId(e.target.value as string)}
                        label={t('accountancy.cashflow.employee')}
                    >
                        <MenuItem value="">—</MenuItem>
                        {users.map((u) => (
                            <MenuItem key={u._id} value={u._id}>
                                {u.name || u._id}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <TextField
                    label={t('accountancy.comment')}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    multiline
                    minRows={2}
                    fullWidth
                />
                <Stack direction="row" spacing={2} mt={2}>
                    <Link href="/dashboard/accountancy/cashflow">
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

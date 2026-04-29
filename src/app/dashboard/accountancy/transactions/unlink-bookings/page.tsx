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
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AccountancyCategory, AccountancyCategoryType } from '@/lib/types';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';
import { unlinkBookingsByCategory } from '@/lib/accountancyUnlinkBookings';
import { getApiErrorMessage } from '@/lib/axiosResponseMessage';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';

export default function UnlinkBookingsByCategoryPage() {
    const { t } = useTranslation();
    const { setSnackbar } = useSnackbar();
    const { isAdmin, isAccountant } = useUser();

    const [transactionType, setTransactionType] = useState<AccountancyCategoryType>('expense');
    const [categoryName, setCategoryName] = useState('');
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);
    const [loading, setLoading] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess) return;
        getAccountancyCategories(transactionType)
            .then(setCategories)
            .catch((e) => console.error('unlink-bookings categories:', e));
    }, [hasAccess, transactionType]);

    useEffect(() => {
        setCategoryName('');
    }, [transactionType]);

    const categoryItems = useMemo(
        () => buildCategoriesForSelect(categories, transactionType),
        [categories, transactionType],
    );

    const handleSubmit = async () => {
        setConfirmOpen(false);
        setLoading(true);
        try {
            const res = await unlinkBookingsByCategory(transactionType, categoryName);
            if (res.success) {
                setSnackbar({
                    open: true,
                    message: `${t('accountancy.unlinkBookingsUpdated')} ${res.modifiedCount ?? 0}`,
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
                <Typography variant="h4">{t('accountancy.unlinkBookingsPageTitle')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy/transactions">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 1 }}>
                {t('accountancy.unlinkBookingsPageTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {t('accountancy.unlinkBookingsDescription')}
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, maxWidth: 560 }}>
                <Stack spacing={2}>
                    <FormControl fullWidth>
                        <InputLabel id="unlink-transaction-type-label">
                            {t('accountancy.transactionRecordType')}
                        </InputLabel>
                        <Select
                            labelId="unlink-transaction-type-label"
                            value={transactionType}
                            label={t('accountancy.transactionRecordType')}
                            onChange={(e) =>
                                setTransactionType(e.target.value as AccountancyCategoryType)
                            }
                        >
                            <MenuItem value="expense">{t('accountancy.expense')}</MenuItem>
                            <MenuItem value="income">{t('accountancy.income')}</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl fullWidth required>
                        <InputLabel id="unlink-category-label">{t('accountancy.category')}</InputLabel>
                        <Select
                            labelId="unlink-category-label"
                            value={categoryName}
                            label={t('accountancy.category')}
                            onChange={(e) => setCategoryName(e.target.value)}
                        >
                            <MenuItem value="">—</MenuItem>
                            {categoryItems.map((item) => (
                                <MenuItem key={item.id} value={item.name}>
                                    {item.depth > 0 ? '\u00A0'.repeat(item.depth * 2) + '↳ ' : ''}
                                    {item.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Button
                        variant="contained"
                        color="warning"
                        startIcon={<LinkOffIcon />}
                        disabled={loading || !categoryName}
                        onClick={() => setConfirmOpen(true)}
                    >
                        {t('accountancy.unlinkBookingsSubmit')}
                    </Button>
                </Stack>
            </Paper>

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>{t('accountancy.unlinkBookingsConfirmTitle')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">{t('accountancy.unlinkBookingsConfirmMessage')}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} color="warning" variant="contained" disabled={loading}>
                        {t('accountancy.unlinkBookingsSubmit')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

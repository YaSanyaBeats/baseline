'use client'

import {
    Box,
    Button,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
    Alert,
    CircularProgress,
} from "@mui/material"
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import Link from 'next/link';
import { useEffect, useState } from "react";
import { AccountancyCategory, AccountancyAttachment, Income, UserObject } from "@/lib/types";
import { getIncomes, updateIncome } from "@/lib/incomes";
import FileAttachments from "@/components/accountancy/FileAttachments";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { useRouter, useParams } from 'next/navigation';
import RoomsMultiSelect from "@/components/objectsMultiSelect/RoomsMultiSelect";
import BookingSelectModal from "@/components/bookingsModal/BookingSelectModal";
import { getAccountancyCategories } from "@/lib/accountancyCategories";

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const params = useParams();
    const incomeId = params?.id as string;
    const { isAdmin, isAccountant } = useUser();
    const [income, setIncome] = useState<Partial<Income & { dateString: string }>>({});
    const [selectedObjects, setSelectedObjects] = useState<UserObject[]>([]);
    const [bookingModalOpen, setBookingModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { setSnackbar } = useSnackbar();
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (hasAccess) {
            getAccountancyCategories('income')
                .then(setCategories)
                .catch((error) => {
                    console.error('Error loading categories:', error);
                });
        }
        if (hasAccess && incomeId) {
            getIncomes()
                .then((items) => {
                    const found = items.find((e) => e._id === incomeId);
                    if (found) {
                        setIncome({
                            _id: found._id,
                            objectId: found.objectId,
                            roomId: found.roomId,
                            bookingId: found.bookingId,
                            category: found.category,
                            amount: found.amount,
                            dateString: found.date
                                ? new Date(found.date as any).toISOString().slice(0, 10)
                                : '',
                            attachments: found.attachments ?? [],
                        });
                        if (found.objectId) {
                            setSelectedObjects([{
                                id: found.objectId,
                                rooms: found.roomId ? [found.roomId] : [],
                            }]);
                        }
                    } else {
                        setSnackbar({
                            open: true,
                            message: t('accountancy.incomeNotFound'),
                            severity: 'error',
                        });
                        router.push('/dashboard/accountancy/income');
                    }
                })
                .catch((error) => {
                    console.error('Error loading data:', error);
                    setSnackbar({
                        open: true,
                        message: t('common.serverError'),
                        severity: 'error',
                    });
                    router.push('/dashboard/accountancy/income');
                })
                .finally(() => {
                    setLoadingData(false);
                });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAccess, incomeId, router]);

    const handleChangeObject = (value: UserObject[]) => {
        setSelectedObjects(value);
        const objectId = value.length > 0 ? value[0].id : undefined;
        const roomId = value.length > 0 && value[0].rooms.length > 0 ? value[0].rooms[0] : undefined;
        setIncome((prev) => ({ ...prev, objectId, roomId }));
        setErrors((prev) => {
            const newErrors = { ...prev };
            if (objectId) {
                delete newErrors.objectId;
            }
            return newErrors;
        });
    };

    const handleChangeField =
        (field: 'category' | 'dateString') =>
            (event: React.ChangeEvent<HTMLInputElement>) => {
                const value = event.target.value;
                setIncome((prev) => ({ ...prev, [field]: value }));
                setErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors[field];
                    return newErrors;
                });
            };

    const handleChangeAmount = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        const num = Number(value);
        setIncome((prev) => ({ ...prev, amount: isNaN(num) ? undefined : num }));
        setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors.amount;
            return newErrors;
        });
    };

    const validate = (): boolean => {
        const validationErrors: Record<string, string> = {};

        if (!income.objectId) {
            validationErrors.objectId = t('accountancy.objectError');
        }
        if (!income.category) {
            validationErrors.category = t('accountancy.category');
        }
        if (!income.dateString) {
            validationErrors.dateString = t('accountancy.incomeDate');
        }
        if (!income.amount || income.amount <= 0) {
            validationErrors.amount = t('accountancy.amount');
        }

        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            setSnackbar({
                open: true,
                message: t('accountancy.formErrors'),
                severity: 'error',
            });
            return false;
        }

        return true;
    };

    const handleOpenBookingModal = () => {
        setBookingModalOpen(true);
    };

    const handleCloseBookingModal = () => {
        setBookingModalOpen(false);
    };

    const handleBookingSelect = (booking: any) => {
        setIncome((prev) => ({
            ...prev,
            bookingId: booking.id,
        }));
    };
    const handleDetachBooking = () => {
        setIncome((prev) => ({ ...prev, bookingId: undefined }));
    };

    const handleSubmit = () => {
        if (!validate()) return;

        setLoading(true);

        const payload: Income = {
            _id: income._id as string,
            objectId: income.objectId as number,
            roomId: income.roomId,
            bookingId: income.bookingId,
            category: income.category as string,
            amount: income.amount as number,
            date: new Date(income.dateString as string),
            attachments: income.attachments ?? [],
            accountantId: '', // не используется при обновлении
        };

        updateIncome(payload)
            .then((res) => {
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    router.push('/dashboard/accountancy/income');
                }
            })
            .catch((error) => {
                console.error('Error updating income:', error);
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
            })
            .finally(() => setLoading(false));
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.editIncome')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    if (loadingData) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <>
            <form noValidate autoComplete="off">
                <Typography variant="h4">{t('accountancy.editIncome')}</Typography>
                <Stack direction="column" spacing={2} mt={2} sx={{ maxWidth: '500px' }}>
                    <Box>
                        <RoomsMultiSelect
                            value={selectedObjects}
                            onChange={handleChangeObject}
                            label={t('accountancy.object')}
                            multiple={false}
                        />
                        {errors.objectId && (
                            <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                                {errors.objectId}
                            </Typography>
                        )}
                    </Box>
                    <Box>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Button
                                variant="outlined"
                                onClick={handleOpenBookingModal}
                            >
                                {t('accountancy.selectBooking')}
                            </Button>
                            {income.bookingId && (
                                <>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('accountancy.bookingId')}: {income.bookingId}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        color="secondary"
                                        onClick={handleDetachBooking}
                                        title={t('accountancy.detachBooking')}
                                        aria-label={t('accountancy.detachBooking')}
                                    >
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                </>
                            )}
                        </Stack>
                    </Box>
                    <Box>
                        <FormControl sx={{ width: '100%' }} error={!!errors.category}>
                            <InputLabel>{t('accountancy.category')}</InputLabel>
                            <Select
                                value={income.category || ''}
                                label={t('accountancy.category')}
                                onChange={(e) =>
                                    setIncome((prev) => ({ ...prev, category: e.target.value as string }))
                                }
                            >
                                {categories.map((cat) => (
                                    <MenuItem key={cat._id || cat.name} value={cat.name}>
                                        {cat.name}
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.category && (
                                <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                                    {errors.category}
                                </Typography>
                            )}
                        </FormControl>
                    </Box>
                    <Box>
                        <TextField
                            id="amount"
                            label={t('accountancy.amount')}
                            variant="outlined"
                            sx={{ width: '100%' }}
                            autoComplete="off"
                            type="number"
                            value={income.amount ?? ''}
                            onChange={handleChangeAmount}
                            error={!!errors.amount}
                            helperText={errors.amount}
                            inputProps={{ min: 0, step: 0.01 }}
                        />
                    </Box>
                    <Box>
                        <TextField
                            id="date"
                            label={t('accountancy.incomeDate')}
                            variant="outlined"
                            sx={{ width: '100%' }}
                            autoComplete="off"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={income.dateString || ''}
                            onChange={handleChangeField('dateString')}
                            error={!!errors.dateString}
                            helperText={errors.dateString}
                        />
                    </Box>
                    <Box>
                        <FileAttachments
                            value={income.attachments ?? []}
                            onChange={(attachments: AccountancyAttachment[]) =>
                                setIncome((prev) => ({ ...prev, attachments }))
                            }
                            disabled={loading}
                        />
                    </Box>
                </Stack>
                <Stack direction={"row"} spacing={2} mt={2}>
                    <Link href="/dashboard/accountancy/income">
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
            </form>
            <BookingSelectModal
                open={bookingModalOpen}
                onClose={handleCloseBookingModal}
                onSelect={handleBookingSelect}
                initialObjectId={income.objectId}
            />
        </>
    );
}


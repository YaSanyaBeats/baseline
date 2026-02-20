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
import { AccountancyCategory, AccountancyAttachment, Income, IncomeStatus, UserObject } from "@/lib/types";
import { getIncomes, updateIncome } from "@/lib/incomes";
import FileAttachments from "@/components/accountancy/FileAttachments";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { useRouter, useParams } from 'next/navigation';
import RoomsMultiSelect from "@/components/objectsMultiSelect/RoomsMultiSelect";
import BookingSelectModal from "@/components/bookingsModal/BookingSelectModal";
import { getAccountancyCategories } from "@/lib/accountancyCategories";
import { buildCategoriesForSelect } from "@/lib/accountancyCategoryUtils";

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
                            quantity: found.quantity ?? 1,
                            dateString: found.date
                                ? new Date(found.date as any).toISOString().slice(0, 10)
                                : '',
                            status: (found as any).status || 'draft',
                            reportMonth: found.reportMonth ?? '',
                            comment: found.comment ?? '',
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

    const handleChangeQuantity = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        const num = Number(value);
        const q = Number.isInteger(num) && num >= 1 ? num : 1;
        setIncome((prev) => ({ ...prev, quantity: q }));
        setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors.quantity;
            return newErrors;
        });
    };

    const getEffectiveCost = (): number => {
        if (income.amount != null && income.amount > 0) return income.amount;
        const cat = categories.find((c) => c.name === income.category);
        return cat?.pricePerUnit ?? 0;
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
        if (getEffectiveCost() <= 0) {
            validationErrors.amount = t('accountancy.cost');
        }
        if (income.quantity != null && (income.quantity < 1 || !Number.isInteger(income.quantity))) {
            validationErrors.quantity = t('accountancy.quantity');
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
            amount: getEffectiveCost(),
            quantity: income.quantity ?? 1,
            date: new Date(income.dateString as string),
            status: (income.status as IncomeStatus) || 'draft',
            reportMonth: income.reportMonth || undefined,
            comment: income.comment ?? '',
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
                                {buildCategoriesForSelect(categories, 'income').map((item) => (
                                    <MenuItem key={item.id} value={item.name}>
                                        {item.depth > 0 ? '\u00A0'.repeat(item.depth * 2) + '↳ ' : ''}
                                        {item.name}
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
                            label={t('accountancy.cost')}
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
                            id="quantity"
                            label={t('accountancy.quantity')}
                            variant="outlined"
                            sx={{ width: '100%' }}
                            autoComplete="off"
                            type="number"
                            value={income.quantity ?? 1}
                            onChange={handleChangeQuantity}
                            error={!!errors.quantity}
                            helperText={errors.quantity}
                            inputProps={{ min: 1, step: 1 }}
                        />
                    </Box>
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            {t('accountancy.amountColumn')}: {((income.quantity ?? 1) * getEffectiveCost()).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Typography>
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
                        <FormControl sx={{ width: '100%' }}>
                            <InputLabel>{t('accountancy.reportMonth')}</InputLabel>
                            <Select
                                value={income.reportMonth ?? ''}
                                label={t('accountancy.reportMonth')}
                                onChange={(e) =>
                                    setIncome((prev) => ({ ...prev, reportMonth: (e.target.value as string) || undefined }))
                                }
                            >
                                <MenuItem value="">—</MenuItem>
                                {(() => {
                                    const options: { value: string; label: string }[] = [];
                                    const now = new Date();
                                    for (let i = 0; i < 24; i++) {
                                        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                                        const y = d.getFullYear();
                                        const m = d.getMonth() + 1;
                                        const value = `${y}-${String(m).padStart(2, '0')}`;
                                        options.push({ value, label: `${t(`accountancy.months.${m}`)} ${y}` });
                                    }
                                    return options.map((o) => (
                                        <MenuItem key={o.value} value={o.value}>
                                            {o.label}
                                        </MenuItem>
                                    ));
                                })()}
                            </Select>
                        </FormControl>
                    </Box>
                    <Box>
                        <FormControl sx={{ minWidth: 150 }}>
                            <InputLabel>{t('accountancy.status')}</InputLabel>
                            <Select
                                value={income.status || 'draft'}
                                onChange={(e) =>
                                    setIncome((prev) => ({ ...prev, status: e.target.value as IncomeStatus }))
                                }
                                label={t('accountancy.status')}
                            >
                                <MenuItem value="draft">{t('accountancy.statusDraft')}</MenuItem>
                                <MenuItem value="confirmed">{t('accountancy.statusConfirmed')}</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                    <Box>
                        <TextField
                            id="comment"
                            label={t('accountancy.comment')}
                            variant="outlined"
                            sx={{ width: '100%' }}
                            multiline
                            minRows={2}
                            value={income.comment ?? ''}
                            onChange={(e) =>
                                setIncome((prev) => ({ ...prev, comment: e.target.value || undefined }))
                            }
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


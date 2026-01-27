'use client'

import {
    Box,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
    Alert,
} from "@mui/material"
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useEffect, useState } from "react";
import { AccountancyCategory, Expense, ExpenseStatus, UserObject } from "@/lib/types";
import { addExpense } from "@/lib/expenses";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { useRouter } from 'next/navigation';
import RoomsMultiSelect from "@/components/objectsMultiSelect/RoomsMultiSelect";
import BookingSelectModal from "@/components/bookingsModal/BookingSelectModal";
import { getAccountancyCategories } from "@/lib/accountancyCategories";

type ExpenseForm = Omit<Expense, '_id' | 'accountantId' | 'accountantName' | 'createdAt' | 'date'> & {
    date: string;
};

const defaultExpense: Partial<ExpenseForm> = {
    objectId: undefined as unknown as number,
    bookingId: undefined,
    category: '',
    amount: undefined as unknown as number,
    date: '',
    comment: '',
    status: 'draft',
};

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const { isAdmin, isAccountant } = useUser();
    const [expense, setExpense] = useState<Partial<ExpenseForm>>(defaultExpense);
    const [selectedObjects, setSelectedObjects] = useState<UserObject[]>([]);
    const [bookingModalOpen, setBookingModalOpen] = useState(false);
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { setSnackbar } = useSnackbar();

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess) return;
        getAccountancyCategories('expense')
            .then(setCategories)
            .catch((error) => {
                console.error('Error loading categories:', error);
            });
    }, [hasAccess]);

    const handleChangeObject = (value: UserObject[]) => {
        setSelectedObjects(value);
        const objectId = value.length > 0 ? value[0].id : undefined;
        setExpense((prev) => ({ ...prev, objectId }));
        setErrors((prev) => {
            const newErrors = { ...prev };
            if (objectId) {
                delete newErrors.objectId;
            }
            return newErrors;
        });
    };

    const handleChangeField =
        (field: keyof ExpenseForm) =>
            (event: React.ChangeEvent<HTMLInputElement>) => {
                const value = event.target.value;
                setExpense((prev) => ({ ...prev, [field]: value }));
                setErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors[field];
                    return newErrors;
                });
            };

    const handleChangeAmount = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        const num = Number(value);
        setExpense((prev) => ({ ...prev, amount: isNaN(num) ? undefined : num }));
        setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors.amount;
            return newErrors;
        });
    };

    const handleChangeStatus = (event: any) => {
        const value = event.target.value as ExpenseStatus;
        setExpense((prev) => ({ ...prev, status: value }));
        setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors.status;
            return newErrors;
        });
    };

    const validate = (): boolean => {
        const validationErrors: Record<string, string> = {};

        if (!expense.objectId) {
            validationErrors.objectId = t('accountancy.objectError');
        }
        if (!expense.category) {
            validationErrors.category = t('accountancy.category');
        }
        if (!expense.date) {
            validationErrors.date = t('accountancy.expenseDate');
        }
        if (!expense.amount || expense.amount <= 0) {
            validationErrors.amount = t('accountancy.amount');
        }
        if (!expense.status) {
            validationErrors.status = t('accountancy.status');
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
        setExpense((prev) => ({
            ...prev,
            bookingId: booking.id,
        }));
    };

    const handleSubmit = () => {
        if (!validate()) return;

        setLoading(true);

        const payload: Expense = {
            objectId: expense.objectId as number,
            bookingId: expense.bookingId,
            category: expense.category as string,
            amount: expense.amount as number,
            date: new Date(expense.date as string),
            comment: expense.comment || '',
            status: (expense.status as ExpenseStatus) || 'draft',
            accountantId: '', // сервер заполнит фактическое значение
        };

        addExpense(payload)
            .then((res) => {
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseAdded'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    router.push('/dashboard/accountancy/expense');
                }
            })
            .catch((error) => {
                console.error('Error adding expense:', error);
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
                <Typography variant="h4">{t('accountancy.addExpense')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <>
            <form noValidate autoComplete="off">
                <Typography variant="h4">{t('accountancy.addExpense')}</Typography>
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
                            {expense.bookingId && (
                                <Typography variant="body2" color="text.secondary">
                                    {t('accountancy.bookingId')}: {expense.bookingId}
                                </Typography>
                            )}
                        </Stack>
                    </Box>
                    <Box>
                        <FormControl sx={{ width: '100%' }} error={!!errors.category}>
                            <InputLabel>{t('accountancy.category')}</InputLabel>
                            <Select
                                value={expense.category || ''}
                                label={t('accountancy.category')}
                                onChange={(e) =>
                                    setExpense((prev) => ({ ...prev, category: e.target.value as string }))
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
                            value={expense.amount ?? ''}
                            onChange={handleChangeAmount}
                            error={!!errors.amount}
                            helperText={errors.amount}
                            inputProps={{ min: 0, step: 0.01 }}
                        />
                    </Box>
                    <Box>
                        <TextField
                            id="date"
                            label={t('accountancy.expenseDate')}
                            variant="outlined"
                            sx={{ width: '100%' }}
                            autoComplete="off"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={expense.date || ''}
                            onChange={handleChangeField('date')}
                            error={!!errors.date}
                            helperText={errors.date}
                        />
                    </Box>
                    <Box>
                        <TextField
                            id="comment"
                            label={t('accountancy.comment')}
                            variant="outlined"
                            sx={{ width: '100%' }}
                            autoComplete="off"
                            multiline
                            minRows={2}
                            value={expense.comment || ''}
                            onChange={handleChangeField('comment')}
                        />
                    </Box>
                    <Box>
                        <FormControl sx={{ width: '100%' }}>
                            <InputLabel>{t('accountancy.status')}</InputLabel>
                            <Select
                                value={expense.status || 'draft'}
                                label={t('accountancy.status')}
                                onChange={handleChangeStatus}
                                error={!!errors.status}
                            >
                                <MenuItem value="draft">{t('accountancy.statusDraft')}</MenuItem>
                                <MenuItem value="confirmed">{t('accountancy.statusConfirmed')}</MenuItem>
                            </Select>
                            {errors.status && (
                                <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                                    {errors.status}
                                </Typography>
                            )}
                        </FormControl>
                    </Box>
                </Stack>
                <Stack direction={"row"} spacing={2} mt={2}>
                    <Link href="/dashboard/accountancy/expense">
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
            </form>
            <BookingSelectModal
                open={bookingModalOpen}
                onClose={handleCloseBookingModal}
                onSelect={handleBookingSelect}
                initialObjectId={expense.objectId}
            />
        </>
    );
}


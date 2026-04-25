'use client';

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
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import { useEffect, useState } from 'react';
import { AccountancyCategory, AccountancyAttachment, Expense, ExpenseStatus, UserObject } from '@/lib/types';
import { getExpenses, updateExpense } from '@/lib/expenses';
import { getCounterparties } from '@/lib/counterparties';
import { getCashflows } from '@/lib/cashflows';
import { getUsersWithCashflow } from '@/lib/users';
import FileAttachments from '@/components/accountancy/FileAttachments';
import SourceRecipientSelect, { type SourceRecipientOptionValue } from '@/components/accountancy/SourceRecipientSelect';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useRouter, useParams } from 'next/navigation';
import RoomsMultiSelect from '@/components/objectsMultiSelect/RoomsMultiSelect';
import BookingSelectModal from '@/components/bookingsModal/BookingSelectModal';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';

type ExpenseForm = Omit<Expense, '_id' | 'accountantId' | 'accountantName' | 'createdAt' | 'date'> & {
    _id?: string;
    date: string;
};

export interface ExpenseEditFormProps {
    /** Куда перенаправить, если расход не найден или доступ запрещён */
    notFoundRedirect: string;
    /** Только для «Мой кэшфлоу»: разрешить правку только записи с cashflowId текущего пользователя */
    requireMatchingUserCashflow?: boolean;
}

export default function ExpenseEditForm({
    notFoundRedirect,
    requireMatchingUserCashflow = false,
}: ExpenseEditFormProps) {
    const { t } = useTranslation();
    const router = useRouter();
    const params = useParams();
    const expenseId = params?.id as string;
    const { isAdmin, isAccountant, user } = useUser();
    const [expense, setExpense] = useState<Partial<ExpenseForm>>({});
    const [selectedObjects, setSelectedObjects] = useState<UserObject[]>([]);
    const [bookingModalOpen, setBookingModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { setSnackbar } = useSnackbar();
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [cashflows, setCashflows] = useState<{ _id: string; name: string }[]>([]);
    const [usersWithCashflow, setUsersWithCashflow] = useState<{ _id: string; name: string }[]>([]);

    const hasAccess = isAdmin || isAccountant || Boolean(user?.hasCashflow);

    useEffect(() => {
        if (!hasAccess || !expenseId) {
            setLoadingData(false);
            return;
        }

        let cancelled = false;

        Promise.all([
            getAccountancyCategories('expense'),
            getCounterparties(),
            getCashflows(),
            getUsersWithCashflow(),
            getExpenses(),
        ])
            .then(([cats, cps, cfsRaw, usersCf, items]) => {
                if (cancelled) return;
                setCategories(cats);
                setCounterparties(cps.map((c) => ({ _id: c._id!, name: c.name })));
                setCashflows(cfsRaw.map((c) => ({ _id: c._id!, name: c.name })));
                setUsersWithCashflow(usersCf);

                const found = items.find((e) => e._id === expenseId);
                if (!found) {
                    setSnackbar({
                        open: true,
                        message: t('accountancy.expenseNotFound'),
                        severity: 'error',
                    });
                    router.push(notFoundRedirect);
                    return;
                }

                if (requireMatchingUserCashflow) {
                    const uid = user?._id?.toString?.() ?? (user as { _id?: string })?._id;
                    const userCf = uid ? cfsRaw.find((cf) => cf.userId === uid) : undefined;
                    const uidCf = userCf?._id;
                    if (!uidCf || found.cashflowId !== uidCf) {
                        setSnackbar({
                            open: true,
                            message: t('accountancy.expenseNotFound'),
                            severity: 'error',
                        });
                        router.push(notFoundRedirect);
                        return;
                    }
                }

                setExpense({
                    _id: found._id,
                    objectId: found.objectId,
                    roomId: found.roomId,
                    bookingId: found.bookingId,
                    source: found.source ?? '',
                    recipient: found.recipient ?? '',
                    cashflowId: found.cashflowId,
                    category: found.category,
                    amount: found.amount,
                    quantity: found.quantity ?? 1,
                    comment: found.comment,
                    status: found.status,
                    date: found.date
                        ? new Date(found.date as Date | string).toISOString().slice(0, 10)
                        : '',
                    reportMonth: found.reportMonth ?? '',
                    attachments: found.attachments ?? [],
                });
                if (found.objectId) {
                    setSelectedObjects([
                        {
                            id: found.objectId,
                            rooms: found.roomId ? [found.roomId] : [],
                        },
                    ]);
                }
            })
            .catch((error) => {
                console.error('Error loading data:', error);
                if (!cancelled) {
                    setSnackbar({
                        open: true,
                        message: t('common.serverError'),
                        severity: 'error',
                    });
                    router.push(notFoundRedirect);
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingData(false);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAccess, expenseId, router, notFoundRedirect, requireMatchingUserCashflow, user?._id]);

    const handleChangeObject = (value: UserObject[]) => {
        setSelectedObjects(value);
        const objectId = value.length > 0 ? value[0].id : undefined;
        const roomId = value.length > 0 && value[0].rooms.length > 0 ? value[0].rooms[0] : undefined;
        setExpense((prev) => ({ ...prev, objectId, roomId }));
        setErrors((prev) => {
            const newErrors = { ...prev };
            if (objectId) {
                delete newErrors.objectId;
            }
            return newErrors;
        });
    };

    const handleChangeField =
        (field: keyof ExpenseForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
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

    const handleChangeQuantity = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        const num = Number(value);
        const q = Number.isInteger(num) && num >= 1 ? num : 1;
        setExpense((prev) => ({ ...prev, quantity: q }));
        setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors.quantity;
            return newErrors;
        });
    };

    const handleChangeStatus = (event: { target: { value: unknown } }) => {
        const value = event.target.value as ExpenseStatus;
        setExpense((prev) => ({ ...prev, status: value }));
        setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors.status;
            return newErrors;
        });
    };

    const getEffectiveCost = (): number => {
        if (expense.amount != null) return expense.amount;
        const cat = categories.find((c) => c.name === expense.category);
        return cat?.pricePerUnit ?? 0;
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
        if (getEffectiveCost() < 0) {
            validationErrors.amount = t('accountancy.cost');
        }
        if (expense.quantity != null && (expense.quantity < 1 || !Number.isInteger(expense.quantity))) {
            validationErrors.quantity = t('accountancy.quantity');
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

    const handleBookingSelect = (booking: { id: number }) => {
        setExpense((prev) => ({
            ...prev,
            bookingId: booking.id,
        }));
    };
    const handleDetachBooking = () => {
        setExpense((prev) => ({ ...prev, bookingId: undefined }));
    };

    const handleSubmit = () => {
        if (!validate()) return;

        setLoading(true);

        const payload: Expense = {
            _id: expense._id as string,
            objectId: expense.objectId as number,
            roomId: expense.roomId,
            bookingId: expense.bookingId,
            source: expense.source || undefined,
            recipient: expense.recipient || undefined,
            cashflowId: expense.cashflowId,
            category: expense.category as string,
            amount: getEffectiveCost(),
            quantity: expense.quantity ?? 1,
            date: new Date(expense.date as string),
            comment: expense.comment || '',
            status: (expense.status as ExpenseStatus) || 'draft',
            reportMonth: expense.reportMonth || undefined,
            attachments: expense.attachments ?? [],
            accountantId: '',
        };

        updateExpense(payload)
            .then((res) => {
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    router.back();
                }
            })
            .catch((error) => {
                console.error('Error updating expense:', error);
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
                <Typography variant="h4">{t('accountancy.editExpense')}</Typography>
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
                <Typography variant="h4">{t('accountancy.editExpense')}</Typography>
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
                            <Button variant="outlined" onClick={handleOpenBookingModal}>
                                {t('accountancy.selectBooking')}
                            </Button>
                            {expense.bookingId && (
                                <>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('accountancy.bookingId')}: {expense.bookingId}
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
                                value={expense.category || ''}
                                label={t('accountancy.category')}
                                onChange={(e) =>
                                    setExpense((prev) => ({ ...prev, category: e.target.value as string }))
                                }
                            >
                                {buildCategoriesForSelect(categories, 'expense').map((item) => (
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
                        <SourceRecipientSelect
                            value={(expense.source as SourceRecipientOptionValue) ?? ''}
                            onChange={(v) => setExpense((prev) => ({ ...prev, source: v || undefined }))}
                            label={t('accountancy.source')}
                            counterparties={counterparties}
                            usersWithCashflow={usersWithCashflow}
                            size="medium"
                            sx={{ width: '100%' }}
                        />
                    </Box>
                    <Box>
                        <SourceRecipientSelect
                            value={(expense.recipient as SourceRecipientOptionValue) ?? ''}
                            onChange={(v) => setExpense((prev) => ({ ...prev, recipient: v || undefined }))}
                            label={t('accountancy.recipient')}
                            counterparties={counterparties}
                            usersWithCashflow={usersWithCashflow}
                            cashflows={cashflows}
                            includeCashflows
                            size="medium"
                            sx={{ width: '100%' }}
                        />
                    </Box>
                    <Box>
                        <TextField
                            id="amount"
                            label={t('accountancy.cost')}
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
                            id="quantity"
                            label={t('accountancy.quantity')}
                            variant="outlined"
                            sx={{ width: '100%' }}
                            autoComplete="off"
                            type="number"
                            value={expense.quantity ?? 1}
                            onChange={handleChangeQuantity}
                            error={!!errors.quantity}
                            helperText={errors.quantity}
                            inputProps={{ min: 1, step: 1 }}
                        />
                    </Box>
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            {t('accountancy.amountColumn')}:{' '}
                            {((expense.quantity ?? 1) * getEffectiveCost()).toLocaleString('ru-RU', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </Typography>
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
                        <FormControl sx={{ width: '100%' }}>
                            <InputLabel>{t('accountancy.reportMonth')}</InputLabel>
                            <Select
                                value={expense.reportMonth ?? ''}
                                label={t('accountancy.reportMonth')}
                                onChange={(e) =>
                                    setExpense((prev) => ({
                                        ...prev,
                                        reportMonth: (e.target.value as string) || undefined,
                                    }))
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
                    <Box>
                        <FileAttachments
                            value={expense.attachments ?? []}
                            onChange={(attachments: AccountancyAttachment[]) =>
                                setExpense((prev) => ({ ...prev, attachments }))
                            }
                            disabled={loading}
                        />
                    </Box>
                </Stack>
                <Stack direction={'row'} spacing={2} mt={2}>
                    <Button
                        type="button"
                        variant="outlined"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => router.back()}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button variant="contained" endIcon={<SendIcon />} onClick={handleSubmit} disabled={loading}>
                        {t('common.save')}
                    </Button>
                </Stack>
            </form>
            <BookingSelectModal
                open={bookingModalOpen}
                onClose={handleCloseBookingModal}
                onSelect={handleBookingSelect}
                initialObjectId={expense.objectId}
                reportMonth={expense.reportMonth ?? ""}
                initialRoomId={expense.roomId}
            />
        </>
    );
}

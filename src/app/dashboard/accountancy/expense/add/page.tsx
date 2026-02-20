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
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from "@mui/material"
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Link from 'next/link';
import { useEffect, useMemo, useState } from "react";
import { AccountancyCategory, AccountancyAttachment, Booking, Expense, ExpenseStatus, UserObject } from "@/lib/types";
import { formatTitle } from "@/lib/format";
import { addExpense } from "@/lib/expenses";
import { getCounterparties } from "@/lib/counterparties";
import FileAttachments from "@/components/accountancy/FileAttachments";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { useRouter } from 'next/navigation';
import RoomsMultiSelect from "@/components/objectsMultiSelect/RoomsMultiSelect";
import BookingSelectModal from "@/components/bookingsModal/BookingSelectModal";
import { getAccountancyCategories } from "@/lib/accountancyCategories";
import { buildCategoriesForSelect } from "@/lib/accountancyCategoryUtils";

type ExpenseItemForm = {
    category: string;
    amount: number | undefined;
    quantity: number;
    date: string;
    comment: string;
    status: ExpenseStatus;
    counterpartyId: string;
    reportMonth: string;
    attachments: AccountancyAttachment[];
    bookingId: number | undefined;
};

const defaultExpenseItem: ExpenseItemForm = {
    category: '',
    amount: undefined,
    quantity: 1,
    date: '',
    comment: '',
    status: 'draft',
    counterpartyId: '',
    reportMonth: '',
    attachments: [],
    bookingId: undefined,
};

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const { isAdmin, isAccountant } = useUser();
    const [selectedObjects, setSelectedObjects] = useState<UserObject[]>([]);
    const [objectId, setObjectId] = useState<number | undefined>();
    const [roomId, setRoomId] = useState<number | undefined>();
    const [items, setItems] = useState<ExpenseItemForm[]>([{ ...defaultExpenseItem }]);
    const [bookingModalForIndex, setBookingModalForIndex] = useState<number | null>(null);
    const [bookingLabels, setBookingLabels] = useState<Record<number, string>>({});
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { setSnackbar } = useSnackbar();

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess) return;
        Promise.all([
            getAccountancyCategories('expense'),
            getCounterparties(),
        ])
            .then(([cats, cps]) => {
                setCategories(cats);
                setCounterparties(cps.map((c) => ({ _id: c._id!, name: c.name })));
            })
            .catch((error) => {
                console.error('Error loading data:', error);
            });
    }, [hasAccess]);

    const handleChangeObject = (value: UserObject[]) => {
        setSelectedObjects(value);
        const objId = value.length > 0 ? value[0].id : undefined;
        const rId = value.length > 0 && value[0].rooms.length > 0 ? value[0].rooms[0] : undefined;
        setObjectId(objId);
        setRoomId(rId);
        setErrors((prev) => {
            const newErrors = { ...prev };
            if (objId) delete newErrors.objectId;
            return newErrors;
        });
    };

    const handleAddItem = () => {
        setItems((prev) => [...prev, { ...defaultExpenseItem }]);
    };

    const handleRemoveItem = (index: number) => {
        if (items.length <= 1) return;
        setItems((prev) => prev.filter((_, i) => i !== index));
    };

    const handleChangeItem = (index: number, field: keyof ExpenseItemForm, value: unknown) => {
        setItems((prev) =>
            prev.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        );
        setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[`item_${index}_${field}`];
            return newErrors;
        });
    };

    const handleChangeItemAmount = (index: number, event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        const num = Number(value);
        handleChangeItem(index, 'amount', isNaN(num) ? undefined : num);
    };

    const handleChangeItemQuantity = (index: number, event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        const num = Number(value);
        const q = Number.isInteger(num) && num >= 1 ? num : 1;
        handleChangeItem(index, 'quantity', q);
    };

    const validate = (): boolean => {
        const validationErrors: Record<string, string> = {};

        if (!objectId) {
            validationErrors.objectId = t('accountancy.objectError');
        }

        items.forEach((item, index) => {
            if (!item.category) {
                validationErrors[`item_${index}_category`] = t('accountancy.category');
            }
            if (!item.date) {
                validationErrors[`item_${index}_date`] = t('accountancy.expenseDate');
            }
            if (!item.amount || item.amount <= 0) {
                validationErrors[`item_${index}_amount`] = t('accountancy.cost');
            }
            if (item.quantity != null && (item.quantity < 1 || !Number.isInteger(item.quantity))) {
                validationErrors[`item_${index}_quantity`] = t('accountancy.quantity');
            }
            if (!item.status) {
                validationErrors[`item_${index}_status`] = t('accountancy.status');
            }
        });

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

    const usedBookingIds = useMemo(
        () => Array.from(new Set(items.map((i) => i.bookingId).filter((id): id is number => typeof id === 'number'))),
        [items],
    );

    const handleOpenBookingModal = (index: number) => setBookingModalForIndex(index);
    const handleCloseBookingModal = () => setBookingModalForIndex(null);

    const handleBookingSelect = (booking: Booking) => {
        if (bookingModalForIndex === null) return;
        handleChangeItem(bookingModalForIndex, 'bookingId', booking.id);
        setBookingLabels((prev) => ({
            ...prev,
            [booking.id]: formatTitle(booking.firstName, booking.lastName, booking.title),
        }));
        setBookingModalForIndex(null);
    };

    const handleDetachBooking = (index: number) => {
        handleChangeItem(index, 'bookingId', undefined);
    };

    const handleSubmit = async () => {
        if (!validate() || !objectId) return;

        setLoading(true);
        let successCount = 0;
        let failCount = 0;

        try {
            for (const item of items) {
                const payload: Expense = {
                    objectId,
                    roomId,
                    bookingId: item.bookingId,
                    counterpartyId: item.counterpartyId || undefined,
                    category: item.category,
                    amount: item.amount as number,
                    quantity: item.quantity ?? 1,
                    date: new Date(item.date),
                    comment: item.comment || '',
                    status: item.status,
                    reportMonth: item.reportMonth || undefined,
                    attachments: item.attachments ?? [],
                    accountantId: '',
                };

                try {
                    const res = await addExpense(payload);
                    if (res.success) successCount++;
                    else failCount++;
                } catch {
                    failCount++;
                }
            }

            const message =
                failCount === 0
                    ? `${t('accountancy.expensesAdded')}: ${successCount}`
                    : `${t('accountancy.expensesAddedPartial')} (${successCount}/${successCount + failCount})`;

            setSnackbar({
                open: true,
                message,
                severity: failCount === 0 ? 'success' : 'warning',
            });

            if (successCount > 0) {
                router.push('/dashboard/accountancy/expense');
            }
        } catch (error) {
            console.error('Error adding expenses:', error);
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

                <Paper variant="outlined" sx={{ p: 2, mt: 2, mb: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('accountancy.commonForAllItems')}
                    </Typography>
                    <Stack direction="column" spacing={2} sx={{ maxWidth: '500px' }}>
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
                    </Stack>
                </Paper>

                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    {t('accountancy.itemsToAdd')}
                </Typography>
                <Box sx={{ overflowX: 'auto', mb: 2 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell width={40}></TableCell>
                            <TableCell>{t('accountancy.bookingColumn')}</TableCell>
                            <TableCell>{t('accountancy.category')}</TableCell>
                            <TableCell>{t('accountancy.counterparty.title')}</TableCell>
                            <TableCell>{t('accountancy.cost')}</TableCell>
                            <TableCell>{t('accountancy.quantity')}</TableCell>
                            <TableCell>{t('accountancy.amountColumn')}</TableCell>
                            <TableCell>{t('accountancy.expenseDate')}</TableCell>
                            <TableCell>{t('accountancy.reportMonth')}</TableCell>
                            <TableCell>{t('accountancy.comment')}</TableCell>
                            <TableCell>{t('accountancy.status')}</TableCell>
                            <TableCell>{t('accountancy.attachments')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.map((item, index) => (
                            <TableRow key={index}>
                                <TableCell>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleRemoveItem(index)}
                                        disabled={items.length <= 1}
                                        aria-label={t('accountancy.removeItem')}
                                    >
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                </TableCell>
                                <TableCell sx={{ minWidth: 200 }}>
                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <FormControl size="small" sx={{ minWidth: 140 }}>
                                            <InputLabel>{t('accountancy.bookingQuickSelect')}</InputLabel>
                                            <Select
                                                value={item.bookingId ?? ''}
                                                label={t('accountancy.bookingQuickSelect')}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    const num = typeof v === 'number' ? v : (String(v).trim() === '' ? undefined : Number(v));
                                                    handleChangeItem(index, 'bookingId', num);
                                                }}
                                            >
                                                <MenuItem value="">—</MenuItem>
                                                {usedBookingIds.map((id) => (
                                                    <MenuItem key={id} value={id}>
                                                        {bookingLabels[id] ?? `#${id}`}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => handleOpenBookingModal(index)}
                                        >
                                            {t('accountancy.selectBooking')}
                                        </Button>
                                        {item.bookingId != null && (
                                            <IconButton
                                                size="small"
                                                color="secondary"
                                                onClick={() => handleDetachBooking(index)}
                                                title={t('accountancy.detachBooking')}
                                                aria-label={t('accountancy.detachBooking')}
                                            >
                                                <CloseIcon fontSize="small" />
                                            </IconButton>
                                        )}
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <FormControl size="small" sx={{ minWidth: 160 }} error={!!errors[`item_${index}_category`]}>
                                        <InputLabel>{t('accountancy.category')}</InputLabel>
                                        <Select
                                            value={item.category || ''}
                                            label={t('accountancy.category')}
                                            onChange={(e) =>
                                                handleChangeItem(index, 'category', e.target.value as string)
                                            }
                                        >
                                            {buildCategoriesForSelect(categories, 'expense').map((item) => (
                                                <MenuItem key={item.id} value={item.name}>
                                                    {item.depth > 0 ? '\u00A0'.repeat(item.depth * 2) + '↳ ' : ''}
                                                    {item.name}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    <FormControl size="small" sx={{ minWidth: 160 }}>
                                        <InputLabel>{t('accountancy.counterparty.title')}</InputLabel>
                                        <Select
                                            value={item.counterpartyId || ''}
                                            label={t('accountancy.counterparty.title')}
                                            onChange={(e) =>
                                                handleChangeItem(index, 'counterpartyId', e.target.value as string)
                                            }
                                        >
                                            <MenuItem value="">—</MenuItem>
                                            {counterparties.map((cp) => (
                                                <MenuItem key={cp._id} value={cp._id}>
                                                    {cp.name}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="number"
                                        label={t('accountancy.cost')}
                                        value={item.amount ?? ''}
                                        onChange={(e) => handleChangeItemAmount(index, e)}
                                        error={!!errors[`item_${index}_amount`]}
                                        inputProps={{ min: 0, step: 0.01 }}
                                        sx={{ width: 120 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="number"
                                        label={t('accountancy.quantity')}
                                        value={item.quantity ?? 1}
                                        onChange={(e) => handleChangeItemQuantity(index, e)}
                                        error={!!errors[`item_${index}_quantity`]}
                                        inputProps={{ min: 1, step: 1 }}
                                        sx={{ width: 90 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2">
                                        {t('accountancy.amountColumn')}: {((item.quantity ?? 1) * (item.amount ?? 0)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="date"
                                        InputLabelProps={{ shrink: true }}
                                        value={item.date || ''}
                                        onChange={(e) =>
                                            handleChangeItem(index, 'date', e.target.value)
                                        }
                                        error={!!errors[`item_${index}_date`]}
                                        sx={{ width: 150 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormControl size="small" sx={{ minWidth: 140 }}>
                                        <InputLabel>{t('accountancy.reportMonth')}</InputLabel>
                                        <Select
                                            value={item.reportMonth || ''}
                                            label={t('accountancy.reportMonth')}
                                            onChange={(e) =>
                                                handleChangeItem(index, 'reportMonth', e.target.value as string)
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
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        placeholder={t('accountancy.comment')}
                                        value={item.comment || ''}
                                        onChange={(e) =>
                                            handleChangeItem(index, 'comment', e.target.value)
                                        }
                                        sx={{ minWidth: 120 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormControl size="small" sx={{ minWidth: 120 }} error={!!errors[`item_${index}_status`]}>
                                        <InputLabel>{t('accountancy.status')}</InputLabel>
                                        <Select
                                            value={item.status || 'draft'}
                                            label={t('accountancy.status')}
                                            onChange={(e) =>
                                                handleChangeItem(index, 'status', e.target.value as ExpenseStatus)
                                            }
                                        >
                                            <MenuItem value="draft">{t('accountancy.statusDraft')}</MenuItem>
                                            <MenuItem value="confirmed">{t('accountancy.statusConfirmed')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    <FileAttachments
                                        value={item.attachments ?? []}
                                        onChange={(attachments: AccountancyAttachment[]) =>
                                            handleChangeItem(index, 'attachments', attachments)
                                        }
                                        disabled={loading}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                </Box>

                <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddItem}
                    sx={{ mb: 2 }}
                >
                    {t('accountancy.addItem')}
                </Button>

                <Stack direction="row" spacing={2} mt={2}>
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
                open={bookingModalForIndex !== null}
                onClose={handleCloseBookingModal}
                onSelect={handleBookingSelect}
                initialObjectId={objectId}
            />
        </>
    );
}

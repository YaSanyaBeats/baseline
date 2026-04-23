'use client';

import {
    Alert,
    Box,
    Button,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    AccountancyCategory,
    AccountancyCategoryType,
    Booking,
    Expense,
    ExpenseStatus,
    Income,
    IncomeStatus,
    UserObject,
} from '@/lib/types';
import { formatTitle } from '@/lib/format';
import { addExpense } from '@/lib/expenses';
import { addIncome } from '@/lib/incomes';
import { getApiErrorMessage } from '@/lib/axiosResponseMessage';
import { formatPartialTransactionAddWarning } from '@/lib/accountancyPartialAddMessage';
import { getCounterparties } from '@/lib/counterparties';
import { getCashflows } from '@/lib/cashflows';
import { getUsersWithCashflow } from '@/lib/users';
import SourceRecipientSelect, {
    type SourceRecipientOptionValue,
    PREFIX_ROOM,
    PREFIX_USER,
} from '@/components/accountancy/SourceRecipientSelect';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import RoomsMultiSelect from '@/components/objectsMultiSelect/RoomsMultiSelect';
import BookingSelectModal from '@/components/bookingsModal/BookingSelectModal';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';

function newRowKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type BulkRow = {
    key: string;
    selectedRoom: UserObject[];
    bookingId?: number;
    source: SourceRecipientOptionValue | '';
    recipient: SourceRecipientOptionValue | '';
    comment: string;
    amount: number | undefined;
    quantity: number;
    status: ExpenseStatus | IncomeStatus;
};

function emptyRowDefaults(): Omit<BulkRow, 'key'> {
    return {
        selectedRoom: [],
        bookingId: undefined,
        source: '',
        recipient: '',
        comment: '',
        amount: undefined,
        quantity: 1,
        status: 'draft',
    };
}

function createRow(): BulkRow {
    return { key: newRowKey(), ...emptyRowDefaults() };
}

function reportMonthToDate(reportMonth: string): Date {
    const [ys, ms] = reportMonth.split('-');
    const y = Number(ys);
    const m = Number(ms);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
        return new Date();
    }
    return new Date(y, m - 1, 1);
}

function reportMonthSelectOptions(t: (key: string) => string): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const value = `${y}-${String(m).padStart(2, '0')}`;
        options.push({ value, label: `${t(`accountancy.months.${m}`)} ${y}` });
    }
    return options;
}

export default function BulkAddTransactionsPage() {
    const { t } = useTranslation();
    const router = useRouter();
    const { isAdmin, isAccountant, user } = useUser();
    const { setSnackbar } = useSnackbar();

    const [transactionType, setTransactionType] = useState<AccountancyCategoryType>('expense');
    const [category, setCategory] = useState('');
    const [reportMonth, setReportMonth] = useState('');
    const [rows, setRows] = useState<BulkRow[]>(() => [createRow()]);
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [cashflows, setCashflows] = useState<{ _id: string; name: string }[]>([]);
    const [usersWithCashflow, setUsersWithCashflow] = useState<{ _id: string; name: string }[]>([]);
    const [bookingModalForKey, setBookingModalForKey] = useState<string | null>(null);
    const [bookingLabels, setBookingLabels] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const hasAccess = isAdmin || isAccountant || Boolean(user?.hasCashflow);
    const sourceLockedForCashflow = Boolean(user?.hasCashflow) && !isAdmin && !isAccountant;
    const recipientLockedForCashflow = Boolean(user?.hasCashflow) && !isAdmin && !isAccountant;
    const currentUserSourceValue: SourceRecipientOptionValue | '' =
        sourceLockedForCashflow && user?._id ? `${PREFIX_USER}${user._id}` : '';
    const currentUserRecipientValue: SourceRecipientOptionValue | '' =
        recipientLockedForCashflow && user?._id ? `${PREFIX_USER}${user._id}` : '';

    useEffect(() => {
        if (!hasAccess) return;
        Promise.all([getCounterparties(), getCashflows(), getUsersWithCashflow()])
            .then(([cps, cfs, usersCf]) => {
                setCounterparties(cps.map((c) => ({ _id: c._id!, name: c.name })));
                setCashflows(cfs.map((c) => ({ _id: c._id!, name: c.name })));
                setUsersWithCashflow(usersCf);
            })
            .catch((e) => console.error('bulk-add load refs:', e));
    }, [hasAccess]);

    useEffect(() => {
        if (!hasAccess) return;
        getAccountancyCategories(transactionType)
            .then(setCategories)
            .catch((e) => console.error('bulk-add categories:', e));
    }, [hasAccess, transactionType]);

    useEffect(() => {
        setCategory('');
    }, [transactionType]);

    const getEffectiveCost = useCallback(
        (row: BulkRow): number => {
            if (row.amount != null) return row.amount;
            const cat = categories.find((c) => c.name === category);
            return cat?.pricePerUnit ?? 0;
        },
        [categories, category],
    );

    const updateRow = (rowKey: string, patch: Partial<BulkRow>) => {
        setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)));
        setErrors((prev) => {
            const next = { ...prev };
            const idx = rows.findIndex((r) => r.key === rowKey);
            if (idx >= 0) {
                Object.keys(patch).forEach((field) => {
                    delete next[`row_${idx}_${field}`];
                });
            }
            return next;
        });
    };

    const handleRowRoomChange = (rowKey: string, value: UserObject[]) => {
        const objId = value.length > 0 ? value[0].id : undefined;
        const rId = value.length > 0 && value[0].rooms.length > 0 ? value[0].rooms[0] : undefined;
        const roomPrefix: SourceRecipientOptionValue | '' =
            objId != null && rId != null ? `${PREFIX_ROOM}${objId}:${rId}` : '';

        setRows((prev) =>
            prev.map((r) => {
                if (r.key !== rowKey) return r;
                const next: BulkRow = { ...r, selectedRoom: value };
                if (transactionType === 'expense' && !sourceLockedForCashflow && roomPrefix) {
                    next.source = roomPrefix;
                } else if (transactionType === 'income' && !recipientLockedForCashflow && roomPrefix) {
                    next.recipient = roomPrefix;
                }
                return next;
            }),
        );
        setErrors((prev) => {
            const next = { ...prev };
            const idx = rows.findIndex((r) => r.key === rowKey);
            if (idx >= 0) delete next[`row_${idx}_selectedRoom`];
            return next;
        });
    };

    const handleChangeAmount = (rowKey: string, raw: string) => {
        const num = Number(raw);
        updateRow(rowKey, { amount: Number.isFinite(num) && raw !== '' ? num : undefined });
    };

    const handleChangeQuantity = (rowKey: string, raw: string) => {
        const num = Number(raw);
        const q = Number.isInteger(num) && num >= 1 ? num : 1;
        updateRow(rowKey, { quantity: q });
    };

    const addRow = () => {
        const base = emptyRowDefaults();
        if (transactionType === 'expense' && sourceLockedForCashflow && currentUserSourceValue) {
            base.source = currentUserSourceValue;
        }
        if (transactionType === 'income' && recipientLockedForCashflow && currentUserRecipientValue) {
            base.recipient = currentUserRecipientValue;
        }
        setRows((prev) => [...prev, { key: newRowKey(), ...base }]);
    };

    const removeRow = (rowKey: string) => {
        if (rows.length <= 1) return;
        setRows((prev) => prev.filter((r) => r.key !== rowKey));
    };

    const usedBookingIds = useMemo(() => {
        const ids = rows.map((r) => r.bookingId).filter((id): id is number => typeof id === 'number');
        return Array.from(new Set(ids));
    }, [rows]);

    const bookingModalObjectId = useMemo(() => {
        if (!bookingModalForKey) return undefined;
        const r = rows.find((x) => x.key === bookingModalForKey);
        if (!r?.selectedRoom.length) return undefined;
        return r.selectedRoom[0].id;
    }, [bookingModalForKey, rows]);

    const validate = (): boolean => {
        const validationErrors: Record<string, string> = {};

        if (!category.trim()) {
            validationErrors.category = t('accountancy.category');
        }
        if (!reportMonth.trim()) {
            validationErrors.reportMonth = t('accountancy.reportMonth');
        }

        rows.forEach((row, index) => {
            if (!row.selectedRoom.length || !row.selectedRoom[0].rooms.length) {
                validationErrors[`row_${index}_selectedRoom`] = t('accountancy.object');
            }
            if (getEffectiveCost(row) < 0) {
                validationErrors[`row_${index}_amount`] = t('accountancy.cost');
            }
            if (row.quantity < 1 || !Number.isInteger(row.quantity)) {
                validationErrors[`row_${index}_quantity`] = t('accountancy.quantity');
            }
            if (transactionType === 'expense' && !row.status) {
                validationErrors[`row_${index}_status`] = t('accountancy.status');
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

    const handleSubmit = async () => {
        if (!validate()) return;

        const opDate = reportMonthToDate(reportMonth);
        setLoading(true);
        let successCount = 0;
        const failures: { category: string; message: string }[] = [];

        try {
            for (const row of rows) {
                const objectId = row.selectedRoom[0].id;
                const roomId = row.selectedRoom[0].rooms[0];
                const effectiveCost = getEffectiveCost(row);

                if (transactionType === 'expense') {
                    const expenseStatus: ExpenseStatus = sourceLockedForCashflow
                        ? 'draft'
                        : row.status === 'confirmed'
                          ? 'confirmed'
                          : 'draft';
                    const payload: Expense = {
                        objectId,
                        roomId,
                        bookingId: row.bookingId,
                        source: (sourceLockedForCashflow ? currentUserSourceValue : row.source) || undefined,
                        recipient: row.recipient || undefined,
                        category,
                        amount: effectiveCost,
                        quantity: row.quantity,
                        date: opDate,
                        comment: row.comment || '',
                        status: expenseStatus,
                        reportMonth: reportMonth || undefined,
                        attachments: [],
                        accountantId: '',
                    };

                    try {
                        const res = await addExpense(payload);
                        if (res.success) successCount++;
                        else
                            failures.push({
                                category,
                                message: res.message || t('common.serverError'),
                            });
                    } catch (err) {
                        failures.push({
                            category,
                            message: getApiErrorMessage(err, t('common.serverError')),
                        });
                    }
                } else {
                    const payload: Income = {
                        objectId,
                        roomId,
                        bookingId: row.bookingId,
                        category,
                        amount: effectiveCost,
                        quantity: row.quantity,
                        date: opDate,
                        status: recipientLockedForCashflow
                            ? 'draft'
                            : row.status === 'confirmed'
                              ? 'confirmed'
                              : 'draft',
                        reportMonth: reportMonth || undefined,
                        source: row.source || undefined,
                        recipient:
                            (recipientLockedForCashflow ? currentUserRecipientValue : row.recipient) || undefined,
                        comment: row.comment || undefined,
                        attachments: [],
                        accountantId: '',
                    };

                    try {
                        const res = await addIncome(payload);
                        if (res.success) successCount++;
                        else
                            failures.push({
                                category,
                                message: res.message || t('common.serverError'),
                            });
                    } catch (err) {
                        failures.push({
                            category,
                            message: getApiErrorMessage(err, t('common.serverError')),
                        });
                    }
                }
            }

            const failCount = failures.length;
            const message =
                failCount === 0
                    ? transactionType === 'expense'
                        ? `${t('accountancy.expensesAdded')}: ${successCount}`
                        : `${t('accountancy.incomesAdded')}: ${successCount}`
                    : formatPartialTransactionAddWarning(t, transactionType, successCount, failures);

            setSnackbar({
                open: true,
                message,
                severity: failCount === 0 ? 'success' : 'warning',
            });

            if (successCount > 0) {
                router.push('/dashboard/accountancy/transactions');
            }
        } catch (e) {
            console.error('bulk-add submit:', e);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleOpenBookingModal = (rowKey: string) => setBookingModalForKey(rowKey);
    const handleCloseBookingModal = () => setBookingModalForKey(null);

    const handleBookingSelect = (booking: Booking) => {
        if (!bookingModalForKey) return;
        updateRow(bookingModalForKey, { bookingId: booking.id });
        setBookingLabels((prev) => ({
            ...prev,
            [booking.id]: formatTitle(booking.firstName, booking.lastName, booking.title),
        }));
        setBookingModalForKey(null);
    };

    const handleDetachBooking = (rowKey: string) => {
        updateRow(rowKey, { bookingId: undefined });
    };

    const monthOptions = useMemo(() => reportMonthSelectOptions(t), [t]);

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.bulkAddTransactionsTitle')}</Typography>
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

            <Typography variant="h4" sx={{ mb: 2 }}>
                {t('accountancy.bulkAddTransactionsTitle')}
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                    {t('accountancy.bulkAddCommonFields')}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap" useFlexGap>
                    <FormControl sx={{ minWidth: 220 }} size="small">
                        <InputLabel>{t('accountancy.transactionRecordType')}</InputLabel>
                        <Select
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
                    <FormControl sx={{ minWidth: 260 }} size="small" error={!!errors.category}>
                        <InputLabel>{t('accountancy.category')}</InputLabel>
                        <Select
                            value={category}
                            label={t('accountancy.category')}
                            onChange={(e) => {
                                setCategory(e.target.value as string);
                                setErrors((prev) => {
                                    const n = { ...prev };
                                    delete n.category;
                                    return n;
                                });
                            }}
                        >
                            <MenuItem value="">—</MenuItem>
                            {buildCategoriesForSelect(categories, transactionType).map((c) => (
                                <MenuItem key={c.id} value={c.name}>
                                    {c.depth > 0 ? '\u00A0'.repeat(c.depth * 2) + '↳ ' : ''}
                                    {c.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl sx={{ minWidth: 220 }} size="small" error={!!errors.reportMonth}>
                        <InputLabel>{t('accountancy.reportMonth')}</InputLabel>
                        <Select
                            value={reportMonth}
                            label={t('accountancy.reportMonth')}
                            onChange={(e) => {
                                setReportMonth(e.target.value as string);
                                setErrors((prev) => {
                                    const n = { ...prev };
                                    delete n.reportMonth;
                                    return n;
                                });
                            }}
                        >
                            <MenuItem value="">—</MenuItem>
                            {monthOptions.map((o) => (
                                <MenuItem key={o.value} value={o.value}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>
            </Paper>

            <Typography variant="subtitle1" sx={{ mb: 1 }}>
                {t('accountancy.bulkAddRowsTitle')}
            </Typography>

            <Box sx={{ overflowX: 'auto', mb: 2 }}>
                <Table size="small" sx={{ minWidth: 1100 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell width={48} />
                            <TableCell sx={{ minWidth: 240 }}>{t('common.room')}</TableCell>
                            <TableCell sx={{ minWidth: 200 }}>{t('accountancy.bookingColumn')}</TableCell>
                            <TableCell sx={{ minWidth: 200 }}>{t('accountancy.source')}</TableCell>
                            <TableCell sx={{ minWidth: 200 }}>{t('accountancy.recipient')}</TableCell>
                            <TableCell sx={{ minWidth: 140 }}>{t('accountancy.comment')}</TableCell>
                            <TableCell sx={{ minWidth: 110 }}>{t('accountancy.cost')}</TableCell>
                            <TableCell sx={{ minWidth: 90 }}>{t('accountancy.quantity')}</TableCell>
                            <TableCell sx={{ minWidth: 130 }}>{t('accountancy.status')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row, index) => (
                            <TableRow key={row.key}>
                                <TableCell>
                                    <IconButton
                                        size="small"
                                        onClick={() => removeRow(row.key)}
                                        disabled={rows.length <= 1}
                                        aria-label={t('accountancy.removeItem')}
                                    >
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                </TableCell>
                                <TableCell>
                                    <RoomsMultiSelect
                                        value={row.selectedRoom}
                                        onChange={(v) => handleRowRoomChange(row.key, v)}
                                        label={t('common.room')}
                                        multiple={false}
                                    />
                                    {errors[`row_${index}_selectedRoom`] && (
                                        <Typography variant="caption" color="error" display="block">
                                            {errors[`row_${index}_selectedRoom`]}
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <FormControl size="small" sx={{ minWidth: 130 }}>
                                            <InputLabel>{t('accountancy.bookingQuickSelect')}</InputLabel>
                                            <Select
                                                value={row.bookingId ?? ''}
                                                label={t('accountancy.bookingQuickSelect')}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    const num =
                                                        typeof v === 'number'
                                                            ? v
                                                            : String(v).trim() === ''
                                                              ? undefined
                                                              : Number(v);
                                                    updateRow(row.key, { bookingId: num });
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
                                            onClick={() => handleOpenBookingModal(row.key)}
                                            disabled={!row.selectedRoom.length}
                                        >
                                            {t('accountancy.selectBooking')}
                                        </Button>
                                        {row.bookingId != null && (
                                            <IconButton
                                                size="small"
                                                color="secondary"
                                                onClick={() => handleDetachBooking(row.key)}
                                                aria-label={t('accountancy.detachBooking')}
                                            >
                                                <CloseIcon fontSize="small" />
                                            </IconButton>
                                        )}
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <SourceRecipientSelect
                                        value={sourceLockedForCashflow ? currentUserSourceValue : row.source}
                                        onChange={(v) => updateRow(row.key, { source: v })}
                                        label={t('accountancy.source')}
                                        counterparties={counterparties}
                                        usersWithCashflow={usersWithCashflow}
                                        disabled={transactionType === 'expense' && sourceLockedForCashflow}
                                        sx={{ minWidth: 180 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <SourceRecipientSelect
                                        value={
                                            transactionType === 'income' && recipientLockedForCashflow
                                                ? currentUserRecipientValue
                                                : row.recipient
                                        }
                                        onChange={(v) => updateRow(row.key, { recipient: v })}
                                        label={t('accountancy.recipient')}
                                        counterparties={counterparties}
                                        usersWithCashflow={usersWithCashflow}
                                        cashflows={cashflows}
                                        includeCashflows
                                        disabled={transactionType === 'income' && recipientLockedForCashflow}
                                        sx={{ minWidth: 180 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        placeholder={t('accountancy.comment')}
                                        value={row.comment}
                                        onChange={(e) => updateRow(row.key, { comment: e.target.value })}
                                        sx={{ minWidth: 120 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="number"
                                        label={t('accountancy.cost')}
                                        value={row.amount ?? ''}
                                        onChange={(e) => handleChangeAmount(row.key, e.target.value)}
                                        error={!!errors[`row_${index}_amount`]}
                                        inputProps={{ min: 0, step: 0.01 }}
                                        sx={{ width: 110 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="number"
                                        label={t('accountancy.quantity')}
                                        value={row.quantity}
                                        onChange={(e) => handleChangeQuantity(row.key, e.target.value)}
                                        error={!!errors[`row_${index}_quantity`]}
                                        inputProps={{ min: 1, step: 1 }}
                                        sx={{ width: 88 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormControl size="small" sx={{ minWidth: 120 }} error={!!errors[`row_${index}_status`]}>
                                        <InputLabel>{t('accountancy.status')}</InputLabel>
                                        <Select
                                            value={
                                                transactionType === 'expense' && sourceLockedForCashflow
                                                    ? 'draft'
                                                    : transactionType === 'income' && recipientLockedForCashflow
                                                      ? 'draft'
                                                      : row.status
                                            }
                                            label={t('accountancy.status')}
                                            onChange={(e) =>
                                                updateRow(row.key, {
                                                    status: e.target.value as ExpenseStatus | IncomeStatus,
                                                })
                                            }
                                            disabled={
                                                (transactionType === 'expense' && sourceLockedForCashflow) ||
                                                (transactionType === 'income' && recipientLockedForCashflow)
                                            }
                                        >
                                            <MenuItem value="draft">{t('accountancy.statusDraft')}</MenuItem>
                                            <MenuItem value="confirmed">{t('accountancy.statusConfirmed')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Box>

            <Button variant="outlined" startIcon={<AddIcon />} onClick={addRow} sx={{ mb: 2 }}>
                {t('accountancy.addRow')}
            </Button>

            <Stack direction="row" spacing={2}>
                <Button variant="outlined" onClick={() => router.push('/dashboard/accountancy/transactions')}>
                    {t('common.cancel')}
                </Button>
                <Button variant="contained" endIcon={<SendIcon />} onClick={handleSubmit} disabled={loading}>
                    {t('common.send')}
                </Button>
            </Stack>

            <BookingSelectModal
                open={bookingModalForKey !== null}
                onClose={handleCloseBookingModal}
                onSelect={handleBookingSelect}
                initialObjectId={bookingModalObjectId}
            />
        </>
    );
}

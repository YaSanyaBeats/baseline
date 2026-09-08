'use client';

import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { AccountancyCategory, Expense, Income } from '@/lib/types';
import {
    addExpenseHandlingDuplicate,
    addIncomeHandlingDuplicate,
    isTransactionAdded,
} from '@/lib/accountancyDuplicateSubmit';
import { useDuplicateTransactionDialog } from '@/components/accountancy/useDuplicateTransactionDialog';
import { getAccountancyMutationErrorMessage } from '@/lib/axiosResponseMessage';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';
import {
    findCategoryById,
    resolveCategorySourceRecipientValue,
    resolveCategoryTransactionDefaults,
} from '@/lib/accountancyCategoryResolve';
import { resolveDistrictForObjectId } from '@/lib/sourceRecipientDistrictFunds';
import { formatRoomSourceRecipient } from '@/lib/roomBinding';
import {
    getAmountFieldDisplayValue,
    parseDecimalInput,
    sanitizeDecimalTyping,
} from '@/lib/accountancyUtils';
import SourceRecipientSelect, {
    type SourceRecipientOptionValue,
} from '@/components/accountancy/SourceRecipientSelect';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';

export type QuickSubtransactionParent = {
    type: 'expense' | 'income';
    record: Expense | Income;
};

type FormState = {
    recordKind: 'expense' | 'income';
    categoryId: string;
    category: string;
    amount: number | undefined;
    amountInput?: string;
    comment: string;
    source: SourceRecipientOptionValue | '';
    recipient: SourceRecipientOptionValue | '';
};

function emptyForm(recordKind: 'expense' | 'income'): FormState {
    return {
        recordKind,
        categoryId: '',
        category: '',
        amount: undefined,
        comment: '',
        source: '',
        recipient: '',
    };
}

function oppositeKind(type: 'expense' | 'income'): 'expense' | 'income' {
    return type === 'expense' ? 'income' : 'expense';
}

function toDate(value: Date | string | undefined): Date {
    if (!value) return new Date();
    const d = typeof value === 'string' ? new Date(value) : value;
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

function defaultParties(
    parent: QuickSubtransactionParent,
    recordKind: 'expense' | 'income',
): Pick<FormState, 'source' | 'recipient'> {
    const source = String(parent.record.source ?? '').trim() as SourceRecipientOptionValue | '';
    const recipient = String(parent.record.recipient ?? '').trim() as SourceRecipientOptionValue | '';
    if (source || recipient) {
        return { source: recipient, recipient: source };
    }
    const objectId = parent.record.objectId;
    const roomName = parent.record.roomName != null ? String(parent.record.roomName) : undefined;
    if (objectId != null && roomName) {
        const roomValue = formatRoomSourceRecipient(objectId, roomName);
        return recordKind === 'expense'
            ? { source: roomValue, recipient: '' }
            : { source: '', recipient: roomValue };
    }
    return { source: '', recipient: '' };
}

type QuickSubtransactionDialogProps = {
    open: boolean;
    parent: QuickSubtransactionParent | null;
    counterparties: { _id: string; name: string }[];
    usersWithCashflow: { _id: string; name: string }[];
    cashflows: { _id: string; name: string }[];
    onClose: () => void;
    onCreated: (created: { type: 'expense' | 'income'; record: Expense | Income }) => void;
};

export default function QuickSubtransactionDialog({
    open,
    parent,
    counterparties,
    usersWithCashflow,
    cashflows,
    onClose,
    onCreated,
}: QuickSubtransactionDialogProps) {
    const { t, language } = useTranslation();
    const { objects } = useObjects();
    const { setSnackbar } = useSnackbar();
    const { askOnDuplicate, DuplicateDialog } = useDuplicateTransactionDialog();
    const [expenseCategories, setExpenseCategories] = useState<AccountancyCategory[]>([]);
    const [incomeCategories, setIncomeCategories] = useState<AccountancyCategory[]>([]);
    const [form, setForm] = useState<FormState>(emptyForm('income'));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        Promise.all([getAccountancyCategories('expense'), getAccountancyCategories('income')])
            .then(([expCats, incCats]) => {
                if (cancelled) return;
                setExpenseCategories(expCats);
                setIncomeCategories(incCats);
            })
            .catch((error) => {
                console.error(error);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    useEffect(() => {
        if (!open || !parent) return;
        const recordKind = oppositeKind(parent.type);
        setForm({
            ...emptyForm(recordKind),
            ...defaultParties(parent, recordKind),
        });
        setErrors({});
    }, [open, parent]);

    const categories = form.recordKind === 'expense' ? expenseCategories : incomeCategories;
    const categoryOptions = useMemo(
        () => buildCategoriesForSelect(categories, form.recordKind, { language }),
        [categories, form.recordKind, language],
    );

    const categoryContext = useMemo(() => {
        if (!parent) return { objects };
        return {
            objectId: parent.record.objectId,
            roomName: parent.record.roomName ?? undefined,
            district: resolveDistrictForObjectId(objects, parent.record.objectId),
            objects,
        };
    }, [parent, objects]);

    const objectLabel = useMemo(() => {
        if (!parent) return '—';
        const obj = objects.find(
            (o) => o.id === parent.record.objectId || o.propertyId === parent.record.objectId,
        );
        const objectName = (obj?.name ?? '').trim();
        const roomLabel = (parent.record.roomName ?? '').trim();
        const parts = [objectName, roomLabel].filter((p) => p.length > 0);
        return parts.length > 0 ? parts.join(' — ') : '—';
    }, [parent, objects]);

    const periodLabel = parent?.record.reportMonth?.trim() || '—';

    const applyCategoryDefaults = (recordKind: 'expense' | 'income', categoryId: string, prev: FormState) => {
        const cats = recordKind === 'expense' ? expenseCategories : incomeCategories;
        const cat = findCategoryById(cats, categoryId);
        const fields = cat
            ? {
                  categoryId,
                  category: cat.name,
              }
            : { categoryId: '', category: '' };
        const defaults = cat ? resolveCategoryTransactionDefaults(cat, categoryContext) : {};
        const parties = defaultParties(parent!, recordKind);
        return {
            ...prev,
            recordKind,
            ...fields,
            source: (defaults.source as SourceRecipientOptionValue | undefined) ?? parties.source,
            recipient: (defaults.recipient as SourceRecipientOptionValue | undefined) ?? parties.recipient,
            amount: defaults.pricePerUnit != null && prev.amount == null ? defaults.pricePerUnit : prev.amount,
            amountInput: defaults.pricePerUnit != null && prev.amount == null ? undefined : prev.amountInput,
        };
    };

    const handleKindChange = (recordKind: 'expense' | 'income') => {
        if (!parent) return;
        setForm((prev) => ({
            ...emptyForm(recordKind),
            amount: prev.amount,
            amountInput: prev.amountInput,
            comment: prev.comment,
            ...defaultParties(parent, recordKind),
        }));
        setErrors({});
    };

    const validate = (): boolean => {
        const next: Record<string, string> = {};
        if (!form.categoryId.trim() || !form.category.trim()) {
            next.category = t('accountancy.formErrors');
        }
        const amount = form.amountInput !== undefined ? parseDecimalInput(form.amountInput) : form.amount;
        if (amount == null || !(amount > 0)) {
            next.amount = t('accountancy.amountMustBeGreaterThanZero');
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async () => {
        if (!parent || !validate()) {
            setSnackbar({
                open: true,
                message: t('accountancy.formErrors'),
                severity: 'error',
            });
            return;
        }
        const amount = (form.amountInput !== undefined ? parseDecimalInput(form.amountInput) : form.amount) ?? 0;
        const parentLink =
            parent.type === 'expense'
                ? { parentExpenseId: parent.record._id }
                : { parentIncomeId: parent.record._id };
        const source = resolveCategorySourceRecipientValue(form.source || undefined, categoryContext);
        const recipient = resolveCategorySourceRecipientValue(form.recipient || undefined, categoryContext);
        const duplicateOpts = { onDuplicateConflict: askOnDuplicate };

        setSaving(true);
        try {
            if (form.recordKind === 'expense') {
                const payload: Expense = {
                    objectId: parent.record.objectId,
                    roomName: parent.record.roomName,
                    bookingId: parent.record.bookingId,
                    source,
                    recipient,
                    cashflowId: parent.record.cashflowId ?? null,
                    categoryId: form.categoryId,
                    category: form.category,
                    amount,
                    quantity: 1,
                    date: toDate(parent.record.date),
                    comment: form.comment || '',
                    status: 'draft',
                    reportMonth: parent.record.reportMonth || undefined,
                    attachments: [],
                    accountantId: '',
                    ...parentLink,
                };
                const res = await addExpenseHandlingDuplicate(payload, duplicateOpts);
                if (!isTransactionAdded(res)) {
                    if (res.skipped) return;
                    setSnackbar({
                        open: true,
                        message: getAccountancyMutationErrorMessage(res, t, t('common.serverError')),
                        severity: 'error',
                    });
                    return;
                }
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expensesAdded'),
                    severity: 'success',
                });
                onCreated({
                    type: 'expense',
                    record: { ...payload, _id: res.id },
                });
                onClose();
                return;
            }

            const payload: Income = {
                objectId: parent.record.objectId,
                roomName: parent.record.roomName,
                bookingId: parent.record.bookingId,
                source,
                recipient,
                cashflowId: parent.record.cashflowId ?? null,
                categoryId: form.categoryId,
                category: form.category,
                amount,
                quantity: 1,
                date: toDate(parent.record.date),
                comment: form.comment || undefined,
                status: 'draft',
                reportMonth: parent.record.reportMonth || undefined,
                attachments: [],
                accountantId: '',
                ...parentLink,
            };
            const res = await addIncomeHandlingDuplicate(payload, duplicateOpts);
            if (!isTransactionAdded(res)) {
                if (res.skipped) return;
                setSnackbar({
                    open: true,
                    message: getAccountancyMutationErrorMessage(res, t, t('common.serverError')),
                    severity: 'error',
                });
                return;
            }
            setSnackbar({
                open: true,
                message: res.message || t('accountancy.incomesAdded'),
                severity: 'success',
            });
            onCreated({
                type: 'income',
                record: { ...payload, _id: res.id },
            });
            onClose();
        } catch (error) {
            console.error(error);
            setSnackbar({
                open: true,
                message: getAccountancyMutationErrorMessage(error, t, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
                <DialogTitle>{t('accountancy.addSubtransaction')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">
                            {t('accountancy.quickSubtransactionHint')}
                        </Typography>
                        <Typography variant="body2">
                            {t('accountancy.object')}: {objectLabel}
                        </Typography>
                        <Typography variant="body2">
                            {t('accountancy.reportMonth')}: {periodLabel}
                        </Typography>
                        <FormControl size="small" fullWidth>
                            <InputLabel>{t('accountancy.recordKindColumn')}</InputLabel>
                            <Select
                                value={form.recordKind}
                                label={t('accountancy.recordKindColumn')}
                                onChange={(e) => handleKindChange(e.target.value as 'expense' | 'income')}
                            >
                                <MenuItem value="expense">{t('accountancy.expense')}</MenuItem>
                                <MenuItem value="income">{t('accountancy.income')}</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth error={!!errors.category}>
                            <InputLabel>{t('accountancy.category')}</InputLabel>
                            <Select
                                value={form.categoryId}
                                label={t('accountancy.category')}
                                onChange={(e) => {
                                    const categoryId = e.target.value as string;
                                    setForm((prev) => applyCategoryDefaults(prev.recordKind, categoryId, prev));
                                }}
                            >
                                {categoryOptions.map((opt) => (
                                    <MenuItem key={opt.id} value={opt.id} sx={{ pl: 1.5 + opt.depth * 2 }}>
                                        {opt.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            size="small"
                            label={t('accountancy.cost')}
                            value={getAmountFieldDisplayValue(form.amount, form.amountInput)}
                            onChange={(e) => {
                                const raw = sanitizeDecimalTyping(e.target.value);
                                const parsed = parseDecimalInput(raw);
                                setForm((prev) => ({
                                    ...prev,
                                    amountInput: raw,
                                    amount: parsed ?? undefined,
                                }));
                            }}
                            error={!!errors.amount}
                            helperText={errors.amount}
                            autoComplete="off"
                            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                        />
                        <SourceRecipientSelect
                            value={form.source}
                            onChange={(v) => setForm((prev) => ({ ...prev, source: v }))}
                            label={t('accountancy.source')}
                            counterparties={counterparties}
                            usersWithCashflow={usersWithCashflow}
                            size="small"
                            sx={{ width: '100%' }}
                        />
                        <SourceRecipientSelect
                            value={form.recipient}
                            onChange={(v) => setForm((prev) => ({ ...prev, recipient: v }))}
                            label={t('accountancy.recipient')}
                            counterparties={counterparties}
                            usersWithCashflow={usersWithCashflow}
                            cashflows={cashflows}
                            includeCashflows
                            size="small"
                            sx={{ width: '100%' }}
                        />
                        <TextField
                            size="small"
                            label={t('accountancy.comment')}
                            value={form.comment}
                            onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
                            multiline
                            minRows={2}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="contained" onClick={() => void handleSubmit()} disabled={saving || !parent}>
                        {t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>
            {DuplicateDialog}
        </>
    );
}

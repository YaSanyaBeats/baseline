'use client';

import {
    Alert,
    Box,
    Button,
    Checkbox,
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
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    AccountancyAttachment,
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
import FileAttachments from '@/components/accountancy/FileAttachments';
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

type BulkSubRow = {
    key: string;
    recordKind: 'expense' | 'income';
    category: string;
    amount: number | undefined;
    comment: string;
    /** Дата транзакции YYYY-MM-DD */
    transactionDate: string;
    source: SourceRecipientOptionValue | '';
    recipient: SourceRecipientOptionValue | '';
    bookingId?: number;
    status: ExpenseStatus | IncomeStatus;
    attachments: AccountancyAttachment[];
};

type BulkRow = {
    key: string;
    selectedRoom: UserObject[];
    bookingId?: number;
    /** Пустая строка — брать общую категорию сверху */
    rowCategory: string;
    source: SourceRecipientOptionValue | '';
    recipient: SourceRecipientOptionValue | '';
    comment: string;
    amount: number | undefined;
    /** Дата транзакции YYYY-MM-DD */
    transactionDate: string;
    status: ExpenseStatus | IncomeStatus;
    splittable: boolean;
    subItems: BulkSubRow[];
    attachments: AccountancyAttachment[];
};

function roomPrefixFromRow(row: BulkRow): SourceRecipientOptionValue | '' {
    if (!row.selectedRoom.length || !row.selectedRoom[0].rooms.length) return '';
    const objId = row.selectedRoom[0].id;
    const rId = row.selectedRoom[0].rooms[0];
    return `${PREFIX_ROOM}${objId}:${rId}`;
}

function createDefaultBulkSub(
    transactionType: AccountancyCategoryType,
    row: BulkRow,
    reportMonthForDefault: string,
): BulkSubRow {
    const roomPrefix = roomPrefixFromRow(row);
    const base: BulkSubRow = {
        key: newRowKey(),
        recordKind: transactionType,
        category: '',
        amount: undefined,
        comment: '',
        transactionDate:
            row.transactionDate.trim() ||
            reportMonthToFirstDayString(reportMonthForDefault) ||
            '',
        source: '',
        recipient: '',
        bookingId: undefined,
        status: 'draft',
        attachments: [],
    };
    if (transactionType === 'expense' && roomPrefix) base.source = roomPrefix;
    if (transactionType === 'income' && roomPrefix) base.recipient = roomPrefix;
    return base;
}

function emptyRowDefaults(): Omit<BulkRow, 'key'> {
    return {
        selectedRoom: [],
        bookingId: undefined,
        rowCategory: '',
        source: '',
        recipient: '',
        comment: '',
        amount: undefined,
        transactionDate: '',
        status: 'draft',
        splittable: false,
        subItems: [],
        attachments: [],
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

/** YYYY-MM → первый день месяца YYYY-MM-DD */
function reportMonthToFirstDayString(reportMonth: string): string {
    if (!/^\d{4}-\d{2}$/.test(reportMonth)) return '';
    return `${reportMonth}-01`;
}

function parseTransactionDateString(iso: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
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

function getEffectiveRowCategory(row: BulkRow, globalCategory: string): string {
    const own = row.rowCategory.trim();
    if (own) return own;
    return globalCategory.trim();
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
    const [subIncomeCategories, setSubIncomeCategories] = useState<AccountancyCategory[]>([]);
    const [subExpenseCategories, setSubExpenseCategories] = useState<AccountancyCategory[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [cashflows, setCashflows] = useState<{ _id: string; name: string }[]>([]);
    const [usersWithCashflow, setUsersWithCashflow] = useState<{ _id: string; name: string }[]>([]);
    const [userCashflowId, setUserCashflowId] = useState<string | undefined>();
    const [bookingModalTarget, setBookingModalTarget] = useState<
        { rowKey: string; subKey?: string } | null
    >(null);
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
                const uid = user?._id?.toString?.() ?? (user as { _id?: string })?._id;
                const userCf = uid ? cfs.find((cf) => cf.userId === uid) : undefined;
                setUserCashflowId(userCf?._id);
            })
            .catch((e) => console.error('bulk-add load refs:', e));
    }, [hasAccess, user?._id]);

    useEffect(() => {
        if (!hasAccess) return;
        const load = async () => {
            try {
                if (transactionType === 'expense') {
                    const [expCats, incCats] = await Promise.all([
                        getAccountancyCategories('expense'),
                        getAccountancyCategories('income'),
                    ]);
                    setCategories(expCats);
                    setSubIncomeCategories(incCats);
                    setSubExpenseCategories([]);
                } else {
                    const [incCats, expCats] = await Promise.all([
                        getAccountancyCategories('income'),
                        getAccountancyCategories('expense'),
                    ]);
                    setCategories(incCats);
                    setSubExpenseCategories(expCats);
                    setSubIncomeCategories([]);
                }
            } catch (e) {
                console.error('bulk-add categories:', e);
            }
        };
        void load();
    }, [hasAccess, transactionType]);

    useEffect(() => {
        setCategory('');
    }, [transactionType]);

    useEffect(() => {
        const first = reportMonthToFirstDayString(reportMonth);
        if (!first) return;
        setRows((prev) =>
            prev.map((r) => (r.transactionDate.trim() === '' ? { ...r, transactionDate: first } : r)),
        );
    }, [reportMonth]);

    const getEffectiveCost = useCallback(
        (row: BulkRow): number => {
            if (row.amount != null) return row.amount;
            const effCat = getEffectiveRowCategory(row, category);
            const cat = categories.find((c) => c.name === effCat);
            return cat?.pricePerUnit ?? 0;
        },
        [categories, category],
    );

    const getEffectiveCostSub = useCallback(
        (sub: BulkSubRow): number => {
            if (sub.amount != null) return sub.amount;
            const list =
                sub.recordKind === 'income'
                    ? transactionType === 'expense'
                        ? subIncomeCategories
                        : categories
                    : transactionType === 'expense'
                      ? categories
                      : subExpenseCategories;
            const cat = list.find((c) => c.name === sub.category);
            return cat?.pricePerUnit ?? 0;
        },
        [categories, subExpenseCategories, subIncomeCategories, transactionType],
    );

    const updateRow = (rowKey: string, patch: Partial<BulkRow>) => {
        setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)));
        setErrors((prev) => {
            const next = { ...prev };
            const idx = rows.findIndex((r) => r.key === rowKey);
            if (idx >= 0) {
                Object.keys(patch).forEach((field) => {
                    delete next[`row_${idx}_${field}`];
                    if (field === 'rowCategory') delete next[`row_${idx}_category`];
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
                next.subItems = r.subItems.map((sub) => {
                    const sn = { ...sub };
                    if (transactionType === 'expense' && roomPrefix) sn.source = roomPrefix;
                    if (transactionType === 'income' && roomPrefix) sn.recipient = roomPrefix;
                    return sn;
                });
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

    const updateSubRow = (rowKey: string, subKey: string, patch: Partial<BulkSubRow>) => {
        setRows((prev) => {
            const rowIdx = prev.findIndex((rr) => rr.key === rowKey);
            const subIdx =
                rowIdx >= 0 ? prev[rowIdx].subItems.findIndex((s) => s.key === subKey) : -1;
            if (rowIdx >= 0 && subIdx >= 0) {
                setErrors((ePrev) => {
                    const n = { ...ePrev };
                    Object.keys(patch).forEach((field) => {
                        delete n[`row_${rowIdx}_sub_${subIdx}_${field}`];
                    });
                    return n;
                });
            }
            return prev.map((r) => {
                if (r.key !== rowKey) return r;
                const subItems = r.subItems.map((s) => (s.key === subKey ? { ...s, ...patch } : s));
                return { ...r, subItems };
            });
        });
    };

    const handleChangeSplittable = (rowKey: string, checked: boolean) => {
        setRows((prev) =>
            prev.map((r) => {
                if (r.key !== rowKey) return r;
                if (!checked) return { ...r, splittable: false, subItems: [] };
                let subItems = r.subItems;
                if (subItems.length === 0) {
                    subItems = [createDefaultBulkSub(transactionType, r, reportMonth)];
                }
                return { ...r, splittable: true, subItems };
            }),
        );
    };

    const handleChangeSubItem = (
        rowKey: string,
        subKey: string,
        field: keyof BulkSubRow,
        value: unknown,
    ) => {
        setRows((prev) => {
            const rowIdx = prev.findIndex((rr) => rr.key === rowKey);
            const subIdx =
                rowIdx >= 0 ? prev[rowIdx].subItems.findIndex((s) => s.key === subKey) : -1;
            if (rowIdx >= 0 && subIdx >= 0) {
                setErrors((ePrev) => {
                    const n = { ...ePrev };
                    delete n[`row_${rowIdx}_sub_${subIdx}_${String(field)}`];
                    if (field === 'recordKind') delete n[`row_${rowIdx}_sub_${subIdx}_category`];
                    return n;
                });
            }
            return prev.map((r) => {
                if (r.key !== rowKey) return r;
                const subItems = r.subItems.map((s) => {
                    if (s.key !== subKey) return s;
                    const next = { ...s, [field]: value } as BulkSubRow;
                    if (field === 'recordKind') return { ...next, category: '' };
                    return next;
                });
                return { ...r, subItems };
            });
        });
    };

    const handleAddSubItem = (rowKey: string) => {
        const row = rows.find((r) => r.key === rowKey);
        if (!row) return;
        const newSub = createDefaultBulkSub(transactionType, row, reportMonth);
        setRows((prev) =>
            prev.map((r) => (r.key === rowKey ? { ...r, subItems: [...r.subItems, newSub] } : r)),
        );
    };

    const handleRemoveSubItem = (rowKey: string, subKey: string) => {
        setRows((prev) =>
            prev.map((r) => {
                if (r.key !== rowKey) return r;
                if (r.subItems.length <= 1) return r;
                return { ...r, subItems: r.subItems.filter((s) => s.key !== subKey) };
            }),
        );
    };

    const addRow = () => {
        const base = emptyRowDefaults();
        if (transactionType === 'expense' && sourceLockedForCashflow && currentUserSourceValue) {
            base.source = currentUserSourceValue;
        }
        if (transactionType === 'income' && recipientLockedForCashflow && currentUserRecipientValue) {
            base.recipient = currentUserRecipientValue;
        }
        if (reportMonth) {
            base.transactionDate = reportMonthToFirstDayString(reportMonth);
        }
        setRows((prev) => [...prev, { key: newRowKey(), ...base }]);
    };

    const removeRow = (rowKey: string) => {
        if (rows.length <= 1) return;
        setRows((prev) => prev.filter((r) => r.key !== rowKey));
    };

    const usedBookingIds = useMemo(() => {
        const ids: number[] = [];
        for (const r of rows) {
            if (r.bookingId != null) ids.push(r.bookingId);
            for (const s of r.subItems) {
                if (s.bookingId != null) ids.push(s.bookingId);
            }
        }
        return Array.from(new Set(ids));
    }, [rows]);

    const bookingModalObjectId = useMemo(() => {
        if (!bookingModalTarget) return undefined;
        const r = rows.find((x) => x.key === bookingModalTarget.rowKey);
        if (!r?.selectedRoom.length) return undefined;
        return r.selectedRoom[0].id;
    }, [bookingModalTarget, rows]);

    const bookingModalRoomId = useMemo(() => {
        if (!bookingModalTarget) return undefined;
        const r = rows.find((x) => x.key === bookingModalTarget.rowKey);
        if (!r?.selectedRoom.length || !r.selectedRoom[0].rooms.length) return undefined;
        return r.selectedRoom[0].rooms[0];
    }, [bookingModalTarget, rows]);

    const validate = (): boolean => {
        const validationErrors: Record<string, string> = {};

        if (!reportMonth.trim()) {
            validationErrors.reportMonth = t('accountancy.reportMonth');
        }

        rows.forEach((row, index) => {
            const effectiveCat = getEffectiveRowCategory(row, category);
            if (!effectiveCat) {
                validationErrors[`row_${index}_category`] = t('accountancy.category');
            }
            if (!row.selectedRoom.length || !row.selectedRoom[0].rooms.length) {
                validationErrors[`row_${index}_selectedRoom`] = t('accountancy.object');
            }
            if (getEffectiveCost(row) < 0) {
                validationErrors[`row_${index}_amount`] = t('accountancy.cost');
            }
            if (!parseTransactionDateString(row.transactionDate)) {
                validationErrors[`row_${index}_transactionDate`] = t('accountancy.transactionDate');
            }
            if (transactionType === 'expense' && !row.status) {
                validationErrors[`row_${index}_status`] = t('accountancy.status');
            }
            if (row.splittable) {
                if (row.subItems.length === 0) {
                    validationErrors[`row_${index}_sub`] = t('accountancy.subtransactionsRequired');
                }
                row.subItems.forEach((sub, sIdx) => {
                    if (!sub.category.trim()) {
                        validationErrors[`row_${index}_sub_${sIdx}_category`] = t('accountancy.category');
                    }
                    if (getEffectiveCostSub(sub) < 0) {
                        validationErrors[`row_${index}_sub_${sIdx}_amount`] = t('accountancy.cost');
                    }
                    if (!sub.status) {
                        validationErrors[`row_${index}_sub_${sIdx}_status`] = t('accountancy.status');
                    }
                    if (!parseTransactionDateString(sub.transactionDate)) {
                        validationErrors[`row_${index}_sub_${sIdx}_transactionDate`] =
                            t('accountancy.transactionDate');
                    }
                });
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

        setLoading(true);
        let successCount = 0;
        const failures: { category: string; message: string }[] = [];

        try {
            for (const row of rows) {
                const objectId = row.selectedRoom[0].id;
                const roomId = row.selectedRoom[0].rooms[0];
                const effectiveCat = getEffectiveRowCategory(row, category);
                const effectiveCost = getEffectiveCost(row);
                const rowDate =
                    parseTransactionDateString(row.transactionDate) ?? reportMonthToDate(reportMonth);

                if (transactionType === 'expense') {
                    const expenseStatus: ExpenseStatus = sourceLockedForCashflow
                        ? 'draft'
                        : row.status === 'confirmed'
                          ? 'confirmed'
                          : 'draft';
                    const basePayload: Expense = {
                        objectId,
                        roomId,
                        bookingId: row.bookingId,
                        source: (sourceLockedForCashflow ? currentUserSourceValue : row.source) || undefined,
                        recipient: row.recipient || undefined,
                        cashflowId: userCashflowId,
                        category: effectiveCat,
                        amount: effectiveCost,
                        quantity: 1,
                        date: rowDate,
                        comment: row.comment || '',
                        status: expenseStatus,
                        reportMonth: reportMonth || undefined,
                        attachments: row.attachments ?? [],
                        accountantId: '',
                    };

                    try {
                        if (row.splittable) {
                            const parentRes = await addExpense(basePayload);
                            if (!parentRes.success || !parentRes.id) {
                                failures.push({
                                    category: effectiveCat,
                                    message: parentRes.message || t('common.serverError'),
                                });
                                continue;
                            }
                            successCount++;
                            const parentId = parentRes.id;
                            for (const sub of row.subItems) {
                                const subCost = getEffectiveCostSub(sub);
                                const subDate =
                                    parseTransactionDateString(sub.transactionDate) ?? rowDate;
                                try {
                                    if (sub.recordKind === 'expense') {
                                        const subPayload: Expense = {
                                            objectId,
                                            roomId,
                                            bookingId: sub.bookingId,
                                            source: sub.source || undefined,
                                            recipient: sub.recipient || undefined,
                                            cashflowId: userCashflowId,
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: 1,
                                            date: subDate,
                                            comment: sub.comment || '',
                                            status: sub.status,
                                            reportMonth: reportMonth || undefined,
                                            attachments: sub.attachments ?? [],
                                            accountantId: '',
                                            parentExpenseId: parentId,
                                        };
                                        const subRes = await addExpense(subPayload);
                                        if (subRes.success) successCount++;
                                        else
                                            failures.push({
                                                category: sub.category,
                                                message: subRes.message || t('common.serverError'),
                                            });
                                    } else {
                                        const subPayload: Income = {
                                            objectId,
                                            roomId,
                                            bookingId: sub.bookingId,
                                            cashflowId: userCashflowId,
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: 1,
                                            date: subDate,
                                            status: sub.status,
                                            reportMonth: reportMonth || undefined,
                                            source: sub.source || undefined,
                                            recipient: sub.recipient || undefined,
                                            comment: sub.comment || undefined,
                                            attachments: sub.attachments ?? [],
                                            accountantId: '',
                                            parentExpenseId: parentId,
                                        };
                                        const subRes = await addIncome(subPayload);
                                        if (subRes.success) successCount++;
                                        else
                                            failures.push({
                                                category: sub.category,
                                                message: subRes.message || t('common.serverError'),
                                            });
                                    }
                                } catch (err) {
                                    failures.push({
                                        category: sub.category,
                                        message: getApiErrorMessage(err, t('common.serverError')),
                                    });
                                }
                            }
                            continue;
                        }

                        const res = await addExpense(basePayload);
                        if (res.success) successCount++;
                        else
                            failures.push({
                                category: effectiveCat,
                                message: res.message || t('common.serverError'),
                            });
                    } catch (err) {
                        failures.push({
                            category: effectiveCat,
                            message: getApiErrorMessage(err, t('common.serverError')),
                        });
                    }
                } else {
                    const incomeStatus: IncomeStatus = recipientLockedForCashflow
                        ? 'draft'
                        : row.status === 'confirmed'
                          ? 'confirmed'
                          : 'draft';
                    const baseIncomePayload: Income = {
                        objectId,
                        roomId,
                        bookingId: row.bookingId,
                        cashflowId: userCashflowId,
                        category: effectiveCat,
                        amount: effectiveCost,
                        quantity: 1,
                        date: rowDate,
                        status: row.splittable ? 'draft' : incomeStatus,
                        reportMonth: reportMonth || undefined,
                        source: row.source || undefined,
                        recipient:
                            (recipientLockedForCashflow ? currentUserRecipientValue : row.recipient) ||
                            undefined,
                        comment: row.comment || undefined,
                        attachments: row.attachments ?? [],
                        accountantId: '',
                    };

                    try {
                        if (row.splittable) {
                            const parentRes = await addIncome(baseIncomePayload);
                            if (!parentRes.success || !parentRes.id) {
                                failures.push({
                                    category: effectiveCat,
                                    message: parentRes.message || t('common.serverError'),
                                });
                                continue;
                            }
                            successCount++;
                            const parentId = parentRes.id;
                            for (const sub of row.subItems) {
                                const subCost = getEffectiveCostSub(sub);
                                const subDate =
                                    parseTransactionDateString(sub.transactionDate) ?? rowDate;
                                try {
                                    if (sub.recordKind === 'expense') {
                                        const subPayload: Expense = {
                                            objectId,
                                            roomId,
                                            bookingId: sub.bookingId,
                                            source: sub.source || undefined,
                                            recipient: sub.recipient || undefined,
                                            cashflowId: userCashflowId,
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: 1,
                                            date: subDate,
                                            comment: sub.comment || '',
                                            status: sub.status,
                                            reportMonth: reportMonth || undefined,
                                            attachments: sub.attachments ?? [],
                                            accountantId: '',
                                            parentIncomeId: parentId,
                                        };
                                        const subRes = await addExpense(subPayload);
                                        if (subRes.success) successCount++;
                                        else
                                            failures.push({
                                                category: sub.category,
                                                message: subRes.message || t('common.serverError'),
                                            });
                                    } else {
                                        const subPayload: Income = {
                                            objectId,
                                            roomId,
                                            bookingId: sub.bookingId,
                                            cashflowId: userCashflowId,
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: 1,
                                            date: subDate,
                                            status: sub.status,
                                            reportMonth: reportMonth || undefined,
                                            source: sub.source || undefined,
                                            recipient: sub.recipient || undefined,
                                            comment: sub.comment || undefined,
                                            attachments: sub.attachments ?? [],
                                            accountantId: '',
                                            parentIncomeId: parentId,
                                        };
                                        const subRes = await addIncome(subPayload);
                                        if (subRes.success) successCount++;
                                        else
                                            failures.push({
                                                category: sub.category,
                                                message: subRes.message || t('common.serverError'),
                                            });
                                    }
                                } catch (err) {
                                    failures.push({
                                        category: sub.category,
                                        message: getApiErrorMessage(err, t('common.serverError')),
                                    });
                                }
                            }
                            continue;
                        }

                        const res = await addIncome(baseIncomePayload);
                        if (res.success) successCount++;
                        else
                            failures.push({
                                category: effectiveCat,
                                message: res.message || t('common.serverError'),
                            });
                    } catch (err) {
                        failures.push({
                            category: effectiveCat,
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

    const handleOpenBookingModal = (rowKey: string) => setBookingModalTarget({ rowKey });

    const handleOpenSubBookingModal = (rowKey: string, subKey: string) =>
        setBookingModalTarget({ rowKey, subKey });

    const handleCloseBookingModal = () => setBookingModalTarget(null);

    const handleBookingSelect = (booking: Booking) => {
        if (!bookingModalTarget) return;
        const { rowKey, subKey } = bookingModalTarget;
        if (subKey) updateSubRow(rowKey, subKey, { bookingId: booking.id });
        else updateRow(rowKey, { bookingId: booking.id });
        setBookingLabels((prev) => ({
            ...prev,
            [booking.id]: formatTitle(booking.firstName, booking.lastName, booking.title),
        }));
        setBookingModalTarget(null);
    };

    const handleDetachBooking = (rowKey: string) => {
        updateRow(rowKey, { bookingId: undefined });
    };

    const handleDetachSubBooking = (rowKey: string, subKey: string) => {
        updateSubRow(rowKey, subKey, { bookingId: undefined });
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
                    <FormControl sx={{ minWidth: 260 }} size="small">
                        <InputLabel>{t('accountancy.category')}</InputLabel>
                        <Select
                            value={category}
                            label={t('accountancy.category')}
                            onChange={(e) => {
                                const v = e.target.value as string;
                                setCategory(v);
                                setErrors((prev) => {
                                    const next = { ...prev };
                                    Object.keys(next).forEach((k) => {
                                        if (/^row_\d+_category$/.test(k)) delete next[k];
                                    });
                                    return next;
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
                <Table size="small" sx={{ minWidth: 1960 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell width={48} />
                            <TableCell sx={{ minWidth: 240 }}>{t('common.room')}</TableCell>
                            <TableCell sx={{ minWidth: 200 }}>{t('accountancy.bookingColumn')}</TableCell>
                            <TableCell sx={{ minWidth: 200 }}>{t('accountancy.category')}</TableCell>
                            <TableCell sx={{ minWidth: 200 }}>{t('accountancy.source')}</TableCell>
                            <TableCell sx={{ minWidth: 200 }}>{t('accountancy.recipient')}</TableCell>
                            <TableCell sx={{ minWidth: 140 }}>{t('accountancy.comment')}</TableCell>
                            <TableCell sx={{ minWidth: 110 }}>{t('accountancy.cost')}</TableCell>
                            <TableCell sx={{ minWidth: 158 }}>{t('accountancy.transactionDate')}</TableCell>
                            <TableCell sx={{ minWidth: 130 }}>{t('accountancy.status')}</TableCell>
                            <TableCell align="center" sx={{ minWidth: 88, whiteSpace: 'nowrap' }}>
                                {t('accountancy.divisibility')}
                            </TableCell>
                            <TableCell sx={{ minWidth: 200 }}>{t('accountancy.attachments')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row, index) => (
                            <Fragment key={row.key}>
                                <TableRow>
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
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            alignItems="center"
                                            flexWrap="wrap"
                                            useFlexGap
                                        >
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
                                        <FormControl
                                            size="small"
                                            sx={{ minWidth: 180 }}
                                            error={!!errors[`row_${index}_category`]}
                                        >
                                            <InputLabel>{t('accountancy.category')}</InputLabel>
                                            <Select
                                                value={getEffectiveRowCategory(row, category) || ''}
                                                label={t('accountancy.category')}
                                                onChange={(e) => {
                                                    const v = e.target.value as string;
                                                    updateRow(row.key, {
                                                        rowCategory: v === category ? '' : v,
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
                                            type="date"
                                            label={t('accountancy.transactionDate')}
                                            InputLabelProps={{ shrink: true }}
                                            value={row.transactionDate}
                                            onChange={(e) =>
                                                updateRow(row.key, { transactionDate: e.target.value })
                                            }
                                            error={!!errors[`row_${index}_transactionDate`]}
                                            sx={{ width: 158 }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <FormControl
                                            size="small"
                                            sx={{ minWidth: 120 }}
                                            error={!!errors[`row_${index}_status`]}
                                        >
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
                                                <MenuItem value="confirmed">
                                                    {t('accountancy.statusConfirmed')}
                                                </MenuItem>
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                    <TableCell align="center" sx={{ verticalAlign: 'middle' }}>
                                        <Checkbox
                                            checked={row.splittable}
                                            onChange={(e) => handleChangeSplittable(row.key, e.target.checked)}
                                            size="small"
                                            inputProps={{
                                                'aria-label': t('accountancy.divisibility'),
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ verticalAlign: 'top', minWidth: 200 }}>
                                        <FileAttachments
                                            value={row.attachments ?? []}
                                            onChange={(atts: AccountancyAttachment[]) =>
                                                updateRow(row.key, { attachments: atts })
                                            }
                                            disabled={loading}
                                        />
                                    </TableCell>
                                </TableRow>
                                {row.splittable && (
                                    <TableRow>
                                        <TableCell colSpan={13} sx={{ py: 2, verticalAlign: 'top' }}>
                                            <Box
                                                sx={{
                                                    p: 2,
                                                    borderRadius: 1,
                                                    bgcolor: (theme) =>
                                                        theme.palette.mode === 'dark'
                                                            ? 'rgba(255,255,255,0.05)'
                                                            : 'rgba(0,0,0,0.03)',
                                                }}
                                            >
                                                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                                    {t('accountancy.subtransactions')}
                                                </Typography>
                                                {errors[`row_${index}_sub`] && (
                                                    <Typography
                                                        variant="caption"
                                                        color="error"
                                                        display="block"
                                                        sx={{ mb: 1 }}
                                                    >
                                                        {errors[`row_${index}_sub`]}
                                                    </Typography>
                                                )}
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell width={40} />
                                                            <TableCell>{t('accountancy.recordKindColumn')}</TableCell>
                                                            <TableCell sx={{ minWidth: 200 }}>
                                                                {t('accountancy.bookingColumn')}
                                                            </TableCell>
                                                            <TableCell>{t('accountancy.category')}</TableCell>
                                                            <TableCell>{t('accountancy.source')}</TableCell>
                                                            <TableCell>{t('accountancy.recipient')}</TableCell>
                                                            <TableCell>{t('accountancy.comment')}</TableCell>
                                                            <TableCell>{t('accountancy.cost')}</TableCell>
                                                            <TableCell sx={{ minWidth: 158 }}>
                                                                {t('accountancy.transactionDate')}
                                                            </TableCell>
                                                            <TableCell>{t('accountancy.status')}</TableCell>
                                                            <TableCell>{t('accountancy.attachments')}</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {row.subItems.map((sub, sIdx) => (
                                                            <TableRow key={sub.key}>
                                                                <TableCell>
                                                                    <IconButton
                                                                        size="small"
                                                                        onClick={() =>
                                                                            handleRemoveSubItem(row.key, sub.key)
                                                                        }
                                                                        disabled={row.subItems.length <= 1}
                                                                        aria-label={t('accountancy.removeItem')}
                                                                    >
                                                                        <DeleteOutlineIcon fontSize="small" />
                                                                    </IconButton>
                                                                </TableCell>
                                                                <TableCell sx={{ minWidth: 120 }}>
                                                                    <FormControl size="small" sx={{ minWidth: 110 }}>
                                                                        <InputLabel>
                                                                            {t('accountancy.recordKindColumn')}
                                                                        </InputLabel>
                                                                        <Select
                                                                            value={sub.recordKind}
                                                                            label={t('accountancy.recordKindColumn')}
                                                                            onChange={(e) =>
                                                                                handleChangeSubItem(
                                                                                    row.key,
                                                                                    sub.key,
                                                                                    'recordKind',
                                                                                    e.target.value as
                                                                                        | 'expense'
                                                                                        | 'income',
                                                                                )
                                                                            }
                                                                        >
                                                                            <MenuItem value="expense">
                                                                                {t('accountancy.expense')}
                                                                            </MenuItem>
                                                                            <MenuItem value="income">
                                                                                {t('accountancy.income')}
                                                                            </MenuItem>
                                                                        </Select>
                                                                    </FormControl>
                                                                </TableCell>
                                                                <TableCell sx={{ minWidth: 200 }}>
                                                                    <Stack
                                                                        direction="row"
                                                                        spacing={1}
                                                                        alignItems="center"
                                                                        flexWrap="wrap"
                                                                        useFlexGap
                                                                    >
                                                                        <FormControl size="small" sx={{ minWidth: 140 }}>
                                                                            <InputLabel>
                                                                                {t('accountancy.bookingQuickSelect')}
                                                                            </InputLabel>
                                                                            <Select
                                                                                value={sub.bookingId ?? ''}
                                                                                label={t('accountancy.bookingQuickSelect')}
                                                                                onChange={(e) => {
                                                                                    const v = e.target.value;
                                                                                    const num =
                                                                                        typeof v === 'number'
                                                                                            ? v
                                                                                            : String(v).trim() === ''
                                                                                              ? undefined
                                                                                              : Number(v);
                                                                                    handleChangeSubItem(
                                                                                        row.key,
                                                                                        sub.key,
                                                                                        'bookingId',
                                                                                        num,
                                                                                    );
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
                                                                            onClick={() =>
                                                                                handleOpenSubBookingModal(
                                                                                    row.key,
                                                                                    sub.key,
                                                                                )
                                                                            }
                                                                        >
                                                                            {t('accountancy.selectBooking')}
                                                                        </Button>
                                                                        {sub.bookingId != null && (
                                                                            <IconButton
                                                                                size="small"
                                                                                color="secondary"
                                                                                onClick={() =>
                                                                                    handleDetachSubBooking(
                                                                                        row.key,
                                                                                        sub.key,
                                                                                    )
                                                                                }
                                                                                aria-label={t(
                                                                                    'accountancy.detachBooking',
                                                                                )}
                                                                            >
                                                                                <CloseIcon fontSize="small" />
                                                                            </IconButton>
                                                                        )}
                                                                    </Stack>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <FormControl
                                                                        size="small"
                                                                        sx={{ minWidth: 160 }}
                                                                        error={
                                                                            !!errors[
                                                                                `row_${index}_sub_${sIdx}_category`
                                                                            ]
                                                                        }
                                                                    >
                                                                        <InputLabel>{t('accountancy.category')}</InputLabel>
                                                                        <Select
                                                                            value={sub.category || ''}
                                                                            label={t('accountancy.category')}
                                                                            onChange={(e) =>
                                                                                handleChangeSubItem(
                                                                                    row.key,
                                                                                    sub.key,
                                                                                    'category',
                                                                                    e.target.value as string,
                                                                                )
                                                                            }
                                                                        >
                                                                            {buildCategoriesForSelect(
                                                                                sub.recordKind === 'income'
                                                                                    ? transactionType === 'expense'
                                                                                        ? subIncomeCategories
                                                                                        : categories
                                                                                    : transactionType === 'expense'
                                                                                      ? categories
                                                                                      : subExpenseCategories,
                                                                                sub.recordKind,
                                                                            ).map((cat) => (
                                                                                <MenuItem key={cat.id} value={cat.name}>
                                                                                    {cat.depth > 0
                                                                                        ? '\u00A0'.repeat(cat.depth * 2) +
                                                                                          '↳ '
                                                                                        : ''}
                                                                                    {cat.name}
                                                                                </MenuItem>
                                                                            ))}
                                                                        </Select>
                                                                    </FormControl>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <SourceRecipientSelect
                                                                        value={sub.source}
                                                                        onChange={(v) =>
                                                                            handleChangeSubItem(
                                                                                row.key,
                                                                                sub.key,
                                                                                'source',
                                                                                v,
                                                                            )
                                                                        }
                                                                        label={t('accountancy.source')}
                                                                        counterparties={counterparties}
                                                                        usersWithCashflow={usersWithCashflow}
                                                                        sx={{ minWidth: 200 }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <SourceRecipientSelect
                                                                        value={sub.recipient}
                                                                        onChange={(v) =>
                                                                            handleChangeSubItem(
                                                                                row.key,
                                                                                sub.key,
                                                                                'recipient',
                                                                                v,
                                                                            )
                                                                        }
                                                                        label={t('accountancy.recipient')}
                                                                        counterparties={counterparties}
                                                                        usersWithCashflow={usersWithCashflow}
                                                                        cashflows={cashflows}
                                                                        includeCashflows
                                                                        sx={{ minWidth: 200 }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <TextField
                                                                        size="small"
                                                                        placeholder={t('accountancy.comment')}
                                                                        value={sub.comment || ''}
                                                                        onChange={(e) =>
                                                                            handleChangeSubItem(
                                                                                row.key,
                                                                                sub.key,
                                                                                'comment',
                                                                                e.target.value,
                                                                            )
                                                                        }
                                                                        sx={{ minWidth: 120 }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <TextField
                                                                        size="small"
                                                                        type="number"
                                                                        label={t('accountancy.cost')}
                                                                        value={sub.amount ?? ''}
                                                                        onChange={(e) => {
                                                                            const num = Number(e.target.value);
                                                                            handleChangeSubItem(
                                                                                row.key,
                                                                                sub.key,
                                                                                'amount',
                                                                                Number.isFinite(num) &&
                                                                                    e.target.value !== ''
                                                                                    ? num
                                                                                    : undefined,
                                                                            );
                                                                        }}
                                                                        error={
                                                                            !!errors[
                                                                                `row_${index}_sub_${sIdx}_amount`
                                                                            ]
                                                                        }
                                                                        inputProps={{ min: 0, step: 0.01 }}
                                                                        sx={{ width: 120 }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <TextField
                                                                        size="small"
                                                                        type="date"
                                                                        label={t('accountancy.transactionDate')}
                                                                        InputLabelProps={{ shrink: true }}
                                                                        value={sub.transactionDate}
                                                                        onChange={(e) =>
                                                                            handleChangeSubItem(
                                                                                row.key,
                                                                                sub.key,
                                                                                'transactionDate',
                                                                                e.target.value,
                                                                            )
                                                                        }
                                                                        error={
                                                                            !!errors[
                                                                                `row_${index}_sub_${sIdx}_transactionDate`
                                                                            ]
                                                                        }
                                                                        sx={{ width: 158 }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <FormControl
                                                                        size="small"
                                                                        sx={{ minWidth: 120 }}
                                                                        error={
                                                                            !!errors[
                                                                                `row_${index}_sub_${sIdx}_status`
                                                                            ]
                                                                        }
                                                                    >
                                                                        <InputLabel>{t('accountancy.status')}</InputLabel>
                                                                        <Select
                                                                            value={sub.status || 'draft'}
                                                                            label={t('accountancy.status')}
                                                                            onChange={(e) =>
                                                                                handleChangeSubItem(
                                                                                    row.key,
                                                                                    sub.key,
                                                                                    'status',
                                                                                    e.target.value as
                                                                                        | ExpenseStatus
                                                                                        | IncomeStatus,
                                                                                )
                                                                            }
                                                                        >
                                                                            <MenuItem value="draft">
                                                                                {t('accountancy.statusDraft')}
                                                                            </MenuItem>
                                                                            <MenuItem value="confirmed">
                                                                                {t('accountancy.statusConfirmed')}
                                                                            </MenuItem>
                                                                        </Select>
                                                                    </FormControl>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <FileAttachments
                                                                        value={sub.attachments ?? []}
                                                                        onChange={(attachments: AccountancyAttachment[]) =>
                                                                            handleChangeSubItem(
                                                                                row.key,
                                                                                sub.key,
                                                                                'attachments',
                                                                                attachments,
                                                                            )
                                                                        }
                                                                        disabled={loading}
                                                                    />
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    startIcon={<AddIcon />}
                                                    onClick={() => handleAddSubItem(row.key)}
                                                    sx={{ mt: 1 }}
                                                >
                                                    {t('accountancy.addSubtransaction')}
                                                </Button>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </Fragment>
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
                open={bookingModalTarget !== null}
                onClose={handleCloseBookingModal}
                onSelect={handleBookingSelect}
                initialObjectId={bookingModalObjectId}
                reportMonth={reportMonth}
                initialRoomId={bookingModalRoomId}
            />
        </>
    );
}

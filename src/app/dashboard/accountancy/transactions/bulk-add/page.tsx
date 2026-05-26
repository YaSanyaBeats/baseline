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
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EventNoteIcon from '@mui/icons-material/EventNote';
import {
    BULK_ADD_TABLE_MIN_WIDTH_PX,
    bulkAddTableColCount,
    COMPACT_COL_AMOUNT as BULK_COL_AMOUNT,
    COMPACT_COL_ATTACH as BULK_COL_ATTACH,
    COMPACT_COL_BOOKING as BULK_COL_BOOKING,
    COMPACT_COL_CAT as BULK_COL_CAT,
    COMPACT_COL_COMMENT as BULK_COL_COMMENT,
    COMPACT_COL_DATE as BULK_COL_DATE,
    COMPACT_COL_DEL as BULK_COL_DEL,
    COMPACT_COL_DIVISIBILITY as BULK_COL_DIVISIBILITY,
    COMPACT_COL_PARTY as BULK_COL_PARTY,
    COMPACT_COL_QTY as BULK_COL_QTY,
    COMPACT_COL_ROOM as BULK_COL_ROOM,
    COMPACT_COL_STATUS as BULK_COL_STATUS,
    COMPACT_COL_SUB_TX as BULK_COL_SUB_TX,
    COMPACT_COL_SUM as BULK_COL_SUM,
    compactCellTextFieldSx as bulkCellTextFieldSx,
    compactBookingLabelSx as bulkBookingLabelSx,
    compactGroupParentRowSx as bulkGroupParentRowSx,
    compactGroupSubHeaderRowSx as bulkGroupSubHeaderRowSx,
    compactGroupSubRowSx as bulkGroupSubRowSx,
    compactInlineSelectSx as bulkInlineSelectSx,
    compactRoomSelectSx as bulkRoomSelectSx,
    compactSourceRecipientSx as bulkSourceRecipientSx,
    compactTableSx as bulkTableSx,
    formatCompactLineTotal as formatBulkLineTotal,
} from '@/lib/accountancyCompactTableStyles';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
import {
    addExpenseHandlingDuplicate,
    addIncomeHandlingDuplicate,
    isTransactionAdded,
    isTransactionFailed,
} from '@/lib/accountancyDuplicateSubmit';
import { useDuplicateTransactionDialog } from '@/components/accountancy/useDuplicateTransactionDialog';
import { getApiErrorMessage } from '@/lib/axiosResponseMessage';
import { formatPartialTransactionAddWarning } from '@/lib/accountancyPartialAddMessage';
import { getCounterparties } from '@/lib/counterparties';
import FileAttachments from '@/components/accountancy/FileAttachments';
import { getCashflows } from '@/lib/cashflows';
import { getUsersWithCashflow } from '@/lib/users';
import SourceRecipientSelect, {
    buildSourceRecipientAutocompleteOptions,
    type SourceRecipientOptionValue,
    PREFIX_ROOM,
    PREFIX_USER,
} from '@/components/accountancy/SourceRecipientSelect';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';
import RoomsMultiSelect from '@/components/objectsMultiSelect/RoomsMultiSelect';
import BookingSelectModal from '@/components/bookingsModal/BookingSelectModal';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';
import {
    findCategoryByName,
    resolveCategorySourceRecipientValue,
    resolveCategoryTransactionDefaults,
    type CategoryDefaultsContext,
    type ObjectForRoomDefaults,
} from '@/lib/accountancyCategoryResolve';
import { isResolvableRoomContextToken } from '@/lib/sourceRecipientParse';
import { resolveDistrictForObjectId } from '@/lib/sourceRecipientDistrictFunds';

function newRowKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stableBulkRoomLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

type BulkSubRow = {
    key: string;
    recordKind: 'expense' | 'income';
    category: string;
    amount: number | undefined;
    quantity: number;
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
    quantity: number;
    /** Дата транзакции YYYY-MM-DD */
    transactionDate: string;
    status: ExpenseStatus | IncomeStatus;
    /** Подтранзакции (родитель + дочерние записи) */
    splittable: boolean;
    /** Учитывать в расчёте синтетических транзакций (только расход) */
    includeInSynthetic: boolean;
    subItems: BulkSubRow[];
    attachments: AccountancyAttachment[];
};

function roomPrefixFromRow(row: BulkRow): SourceRecipientOptionValue | '' {
    if (!row.selectedRoom.length || !row.selectedRoom[0].rooms.length) return '';
    const objId = row.selectedRoom[0].id;
    const rId = row.selectedRoom[0].rooms[0];
    return `${PREFIX_ROOM}${objId}:${rId}`;
}

function roomContextFromRow(
    row: BulkRow,
    objectsList: { id: number; propertyId?: number; district?: string; roomTypes: ObjectForRoomDefaults['roomTypes'] }[],
): CategoryDefaultsContext {
    if (!row.selectedRoom.length || !row.selectedRoom[0].rooms.length) {
        return { objects: objectsList };
    }
    const objectId = row.selectedRoom[0].id;
    return {
        objectId,
        roomName: String(row.selectedRoom[0].rooms[0]),
        district: resolveDistrictForObjectId(objectsList, objectId),
        objects: objectsList,
    };
}

function createDefaultBulkSub(
    transactionType: AccountancyCategoryType,
    row: BulkRow,
    reportMonthForDefault: string,
): BulkSubRow {
    const opp: 'expense' | 'income' = transactionType === 'expense' ? 'income' : 'expense';
    const roomPrefix = roomPrefixFromRow(row);
    const base: BulkSubRow = {
        key: newRowKey(),
        recordKind: opp,
        category: '',
        amount: undefined,
        quantity: 1,
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
    const hasParties =
        String(row.source ?? '').trim() !== '' || String(row.recipient ?? '').trim() !== '';
    if (hasParties) {
        base.source = row.recipient;
        base.recipient = row.source;
    } else {
        if (opp === 'expense' && roomPrefix) base.source = roomPrefix;
        if (opp === 'income' && roomPrefix) base.recipient = roomPrefix;
    }
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
        quantity: 1,
        transactionDate: '',
        status: 'draft',
        splittable: false,
        includeInSynthetic: true,
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
    const { objects } = useObjects();
    const { setSnackbar } = useSnackbar();
    const { askOnDuplicate, DuplicateDialog } = useDuplicateTransactionDialog();

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
            })
            .catch((e) => console.error('bulk-add load refs:', e));
    }, [hasAccess]);

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

        const district = resolveDistrictForObjectId(objects, objId);
        const roomContext: CategoryDefaultsContext = {
            objectId: objId,
            roomName: rId != null ? String(rId) : undefined,
            district,
            objects,
        };
        const resolveField = (
            v: SourceRecipientOptionValue | '',
            field: 'source' | 'recipient',
        ): SourceRecipientOptionValue | '' => {
            const resolved = resolveCategorySourceRecipientValue(v, roomContext);
            if (resolved) return resolved as SourceRecipientOptionValue;
            if (isResolvableRoomContextToken(v)) return v;
            if (field === 'source' && transactionType === 'expense' && !sourceLockedForCashflow && roomPrefix) {
                return roomPrefix;
            }
            if (field === 'recipient' && transactionType === 'income' && !recipientLockedForCashflow && roomPrefix) {
                return roomPrefix;
            }
            return v;
        };

        setRows((prev) =>
            prev.map((r) => {
                if (r.key !== rowKey) return r;
                const effCatName = getEffectiveRowCategory(r, category);
                const rowCat = findCategoryByName(categories, effCatName, transactionType);
                const rowDefaults = rowCat
                    ? resolveCategoryTransactionDefaults(rowCat, roomContext)
                    : {};
                const next: BulkRow = {
                    ...r,
                    selectedRoom: value,
                    source: (rowDefaults.source ??
                        resolveField(r.source, 'source')) as SourceRecipientOptionValue,
                    recipient: (rowDefaults.recipient ??
                        resolveField(r.recipient, 'recipient')) as SourceRecipientOptionValue,
                    amount: rowDefaults.pricePerUnit != null ? rowDefaults.pricePerUnit : r.amount,
                };
                next.subItems = r.subItems.map((sub) => {
                    const subList =
                        sub.recordKind === 'income'
                            ? transactionType === 'expense'
                                ? subIncomeCategories
                                : categories
                            : transactionType === 'expense'
                              ? categories
                              : subExpenseCategories;
                    const subCat = findCategoryByName(subList, sub.category, sub.recordKind);
                    const subDefaults = subCat
                        ? resolveCategoryTransactionDefaults(subCat, roomContext)
                        : {};
                    const resolveSubField = (
                        v: SourceRecipientOptionValue | '',
                        field: 'source' | 'recipient',
                    ): SourceRecipientOptionValue | '' => {
                        const resolved = resolveCategorySourceRecipientValue(v, roomContext);
                        if (resolved) return resolved as SourceRecipientOptionValue;
                        if (isResolvableRoomContextToken(v)) return v;
                        if (field === 'source' && sub.recordKind === 'expense' && roomPrefix) {
                            return roomPrefix;
                        }
                        if (field === 'recipient' && sub.recordKind === 'income' && roomPrefix) {
                            return roomPrefix;
                        }
                        return v;
                    };
                    return {
                        ...sub,
                        source: (subDefaults.source ??
                            resolveSubField(sub.source, 'source')) as SourceRecipientOptionValue,
                        recipient: (subDefaults.recipient ??
                            resolveSubField(sub.recipient, 'recipient')) as SourceRecipientOptionValue,
                        amount: subDefaults.pricePerUnit != null ? subDefaults.pricePerUnit : sub.amount,
                    };
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

    const handleChangeQuantity = (rowKey: string, raw: string) => {
        const num = Number(raw);
        const q = Number.isInteger(num) && num >= 1 ? num : 1;
        updateRow(rowKey, { quantity: q });
    };

    const handleChangeIncludeInSynthetic = (rowKey: string, checked: boolean) => {
        updateRow(rowKey, { includeInSynthetic: checked });
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
                    if (field === 'category') {
                        const list =
                            next.recordKind === 'income'
                                ? transactionType === 'expense'
                                    ? subIncomeCategories
                                    : categories
                                : transactionType === 'expense'
                                  ? categories
                                  : subExpenseCategories;
                        const cat = findCategoryByName(list, String(value), next.recordKind);
                        const defaults = resolveCategoryTransactionDefaults(cat, roomContextFromRow(r, objects));
                        if (defaults.source) next.source = defaults.source as SourceRecipientOptionValue;
                        if (defaults.recipient) next.recipient = defaults.recipient as SourceRecipientOptionValue;
                        if (defaults.pricePerUnit != null) next.amount = defaults.pricePerUnit;
                    }
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

    const bookingModalInitialRoomId = useMemo(() => {
        if (!bookingModalTarget) return undefined;
        const r = rows.find((x) => x.key === bookingModalTarget.rowKey);
        if (!r?.selectedRoom.length || !r.selectedRoom[0].rooms.length) return undefined;
        const oid = r.selectedRoom[0].id;
        const roomPick = r.selectedRoom[0].rooms[0];
        const roomName = String(roomPick);
        const o = objects.find((x) => x.id === oid);
        const rt = o?.roomTypes?.find((room) => stableBulkRoomLabel(room) === roomName);
        return rt?.id;
    }, [bookingModalTarget, rows, objects]);

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
            if (row.quantity != null && (row.quantity < 1 || !Number.isInteger(row.quantity))) {
                validationErrors[`row_${index}_quantity`] = t('accountancy.quantity');
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
                    if (sub.quantity != null && (sub.quantity < 1 || !Number.isInteger(sub.quantity))) {
                        validationErrors[`row_${index}_sub_${sIdx}_quantity`] = t('accountancy.quantity');
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
        const duplicateOpts = { onDuplicateConflict: askOnDuplicate };

        try {
            for (const row of rows) {
                const objectId = row.selectedRoom[0].id;
                const roomName = String(row.selectedRoom[0].rooms[0]);
                const roomContext = {
                    ...roomContextFromRow(row, objects),
                };
                const resolveSr = (v: SourceRecipientOptionValue | '' | undefined) =>
                    resolveCategorySourceRecipientValue(v, roomContext);
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
                        roomName,
                        bookingId: row.bookingId,
                        source: sourceLockedForCashflow
                            ? resolveSr(currentUserSourceValue)
                            : resolveSr(row.source),
                        recipient: resolveSr(row.recipient),
                        category: effectiveCat,
                        amount: effectiveCost,
                        quantity: row.quantity ?? 1,
                        date: rowDate,
                        comment: row.comment || '',
                        status: expenseStatus,
                        reportMonth: reportMonth || undefined,
                        attachments: row.attachments ?? [],
                        accountantId: '',
                        includeInSynthetic: row.includeInSynthetic,
                    };

                    try {
                        if (row.splittable) {
                            const parentRes = await addExpenseHandlingDuplicate(basePayload, duplicateOpts);
                            if (parentRes.skipped) continue;
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
                                            roomName,
                                            bookingId: sub.bookingId,
                                            source: resolveSr(sub.source),
                                            recipient: resolveSr(sub.recipient),
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: sub.quantity ?? 1,
                                            date: subDate,
                                            comment: sub.comment || '',
                                            status: sub.status,
                                            reportMonth: reportMonth || undefined,
                                            attachments: sub.attachments ?? [],
                                            accountantId: '',
                                            parentExpenseId: parentId,
                                        };
                                        const subRes = await addExpenseHandlingDuplicate(subPayload, duplicateOpts);
                                        if (isTransactionAdded(subRes)) successCount++;
                                        else if (isTransactionFailed(subRes))
                                            failures.push({
                                                category: sub.category,
                                                message: subRes.message || t('common.serverError'),
                                            });
                                    } else {
                                        const subPayload: Income = {
                                            objectId,
                                            roomName,
                                            bookingId: sub.bookingId,
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: sub.quantity ?? 1,
                                            date: subDate,
                                            status: sub.status,
                                            reportMonth: reportMonth || undefined,
                                            source: resolveSr(sub.source),
                                            recipient: resolveSr(sub.recipient),
                                            comment: sub.comment || undefined,
                                            attachments: sub.attachments ?? [],
                                            accountantId: '',
                                            parentExpenseId: parentId,
                                        };
                                        const subRes = await addIncomeHandlingDuplicate(subPayload, duplicateOpts);
                                        if (isTransactionAdded(subRes)) successCount++;
                                        else if (isTransactionFailed(subRes))
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

                        const res = await addExpenseHandlingDuplicate(basePayload, duplicateOpts);
                        if (isTransactionAdded(res)) successCount++;
                        else if (isTransactionFailed(res))
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
                        roomName,
                        bookingId: row.bookingId,
                        category: effectiveCat,
                        amount: effectiveCost,
                        quantity: row.quantity ?? 1,
                        date: rowDate,
                        status: row.splittable ? 'draft' : incomeStatus,
                        reportMonth: reportMonth || undefined,
                        source: resolveSr(row.source),
                        recipient: recipientLockedForCashflow
                            ? resolveSr(currentUserRecipientValue)
                            : resolveSr(row.recipient),
                        comment: row.comment || undefined,
                        attachments: row.attachments ?? [],
                        accountantId: '',
                    };

                    try {
                        if (row.splittable) {
                            const parentRes = await addIncomeHandlingDuplicate(baseIncomePayload, duplicateOpts);
                            if (parentRes.skipped) continue;
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
                                            roomName,
                                            bookingId: sub.bookingId,
                                            source: resolveSr(sub.source),
                                            recipient: resolveSr(sub.recipient),
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: sub.quantity ?? 1,
                                            date: subDate,
                                            comment: sub.comment || '',
                                            status: sub.status,
                                            reportMonth: reportMonth || undefined,
                                            attachments: sub.attachments ?? [],
                                            accountantId: '',
                                            parentIncomeId: parentId,
                                        };
                                        const subRes = await addExpenseHandlingDuplicate(subPayload, duplicateOpts);
                                        if (isTransactionAdded(subRes)) successCount++;
                                        else if (isTransactionFailed(subRes))
                                            failures.push({
                                                category: sub.category,
                                                message: subRes.message || t('common.serverError'),
                                            });
                                    } else {
                                        const subPayload: Income = {
                                            objectId,
                                            roomName,
                                            bookingId: sub.bookingId,
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: sub.quantity ?? 1,
                                            date: subDate,
                                            status: sub.status,
                                            reportMonth: reportMonth || undefined,
                                            source: resolveSr(sub.source),
                                            recipient: resolveSr(sub.recipient),
                                            comment: sub.comment || undefined,
                                            attachments: sub.attachments ?? [],
                                            accountantId: '',
                                            parentIncomeId: parentId,
                                        };
                                        const subRes = await addIncomeHandlingDuplicate(subPayload, duplicateOpts);
                                        if (isTransactionAdded(subRes)) successCount++;
                                        else if (isTransactionFailed(subRes))
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

                        const res = await addIncomeHandlingDuplicate(baseIncomePayload, duplicateOpts);
                        if (isTransactionAdded(res)) successCount++;
                        else if (isTransactionFailed(res))
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
                router.back();
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

    const sourceRecipientOptions = useMemo(
        () =>
            buildSourceRecipientAutocompleteOptions({
                objects,
                counterparties,
                usersWithCashflow,
                cashflows: [],
                includeCashflows: false,
                includeBookingRoomOption: false,
                t,
            }),
        [objects, counterparties, usersWithCashflow, t],
    );

    const recipientRecipientOptions = useMemo(
        () =>
            buildSourceRecipientAutocompleteOptions({
                objects,
                counterparties,
                usersWithCashflow,
                cashflows,
                includeCashflows: true,
                includeBookingRoomOption: false,
                t,
            }),
        [objects, counterparties, usersWithCashflow, cashflows, t],
    );

    const bulkColCount = bulkAddTableColCount(transactionType);

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
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Button
                    variant="text"
                    size="small"
                    startIcon={<ArrowBackIcon fontSize="small" />}
                    sx={{ minWidth: 0, px: 1 }}
                    onClick={() => router.back()}
                >
                    {t('common.back')}
                </Button>
                <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
                    {t('accountancy.bulkAddTransactionsTitle')}
                </Typography>
            </Stack>

            <Paper variant="outlined" sx={{ px: 1, py: 0.75, mb: 1 }}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontWeight: 600 }}>
                        {t('accountancy.bulkAddCommonFields')}:
                    </Typography>
                    <FormControl sx={{ minWidth: 120, maxWidth: 140 }} size="small">
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
                    <FormControl sx={{ minWidth: 160, maxWidth: 220 }} size="small">
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
                    <FormControl sx={{ minWidth: 140, maxWidth: 160 }} size="small" error={!!errors.reportMonth}>
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
                    <Box sx={{ flex: 1 }} />
                    <Button variant="outlined" size="small" startIcon={<AddIcon fontSize="small" />} onClick={addRow}>
                        {t('accountancy.addRow')}
                    </Button>
                </Stack>
            </Paper>

            <TableContainer
                component={Paper}
                variant="outlined"
                sx={{ mb: 1, overflowX: 'auto', overflowY: 'visible' }}
            >
                <Table size="small" stickyHeader sx={{ ...bulkTableSx, minWidth: BULK_ADD_TABLE_MIN_WIDTH_PX }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ width: BULK_COL_DEL, maxWidth: BULK_COL_DEL }} />
                            <TableCell sx={{ width: BULK_COL_ROOM, maxWidth: BULK_COL_ROOM }}>{t('common.room')}</TableCell>
                            <TableCell sx={{ width: BULK_COL_BOOKING, maxWidth: BULK_COL_BOOKING }}>{t('accountancy.bookingColumn')}</TableCell>
                            <TableCell sx={{ width: BULK_COL_CAT, maxWidth: BULK_COL_CAT }}>{t('accountancy.category')}</TableCell>
                            <TableCell sx={{ width: BULK_COL_PARTY, maxWidth: BULK_COL_PARTY }}>{t('accountancy.source')}</TableCell>
                            <TableCell sx={{ width: BULK_COL_PARTY, maxWidth: BULK_COL_PARTY }}>{t('accountancy.recipient')}</TableCell>
                            <TableCell sx={{ width: BULK_COL_COMMENT, maxWidth: BULK_COL_COMMENT }}>{t('accountancy.comment')}</TableCell>
                            <TableCell sx={{ width: BULK_COL_AMOUNT, maxWidth: BULK_COL_AMOUNT }}>{t('accountancy.cost')}</TableCell>
                            <TableCell sx={{ width: BULK_COL_QTY, maxWidth: BULK_COL_QTY }}>{t('accountancy.quantity')}</TableCell>
                            <TableCell sx={{ width: BULK_COL_SUM, maxWidth: BULK_COL_SUM }}>{t('accountancy.amountColumn')}</TableCell>
                            <TableCell sx={{ width: BULK_COL_DATE, maxWidth: BULK_COL_DATE }}>{t('accountancy.transactionDate')}</TableCell>
                            <TableCell sx={{ width: BULK_COL_STATUS, maxWidth: BULK_COL_STATUS }}>{t('accountancy.status')}</TableCell>
                            <TableCell align="center" sx={{ width: BULK_COL_SUB_TX, maxWidth: BULK_COL_SUB_TX }}>
                                {t('accountancy.subtransactionColumn')}
                            </TableCell>
                            {transactionType === 'expense' && (
                                <TableCell align="center" sx={{ width: BULK_COL_DIVISIBILITY, maxWidth: BULK_COL_DIVISIBILITY }}>
                                    {t('accountancy.divisibility')}
                                </TableCell>
                            )}
                            <TableCell sx={{ width: BULK_COL_ATTACH, maxWidth: BULK_COL_ATTACH }} />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row, index) => (
                            <Fragment key={row.key}>
                                <TableRow hover sx={row.splittable ? bulkGroupParentRowSx : undefined}>
                                    <TableCell>
                                        <IconButton
                                            size="small"
                                            onClick={() => removeRow(row.key)}
                                            disabled={rows.length <= 1}
                                            aria-label={t('accountancy.removeItem')}
                                        >
                                            <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                                        </IconButton>
                                    </TableCell>
                                    <TableCell>
                                        <RoomsMultiSelect
                                            value={row.selectedRoom}
                                            onChange={(v) => handleRowRoomChange(row.key, v)}
                                            label={t('common.room')}
                                            multiple={false}
                                            hideLabel
                                            sx={bulkRoomSelectSx}
                                        />
                                        {errors[`row_${index}_selectedRoom`] && (
                                            <Typography variant="caption" color="error" sx={{ fontSize: '0.6rem', lineHeight: 1.1 }}>
                                                {errors[`row_${index}_selectedRoom`]}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={0.25} alignItems="flex-start">
                                            <Tooltip title={t('accountancy.selectBooking')}>
                                                <span>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleOpenBookingModal(row.key)}
                                                        disabled={!row.selectedRoom.length}
                                                        aria-label={t('accountancy.selectBooking')}
                                                    >
                                                        <EventNoteIcon sx={{ fontSize: '1rem' }} />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                            {row.bookingId != null ? (
                                                <>
                                                    <Typography variant="caption" sx={bulkBookingLabelSx}>
                                                        {bookingLabels[row.bookingId] ?? `#${row.bookingId}`}
                                                    </Typography>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleDetachBooking(row.key)}
                                                        aria-label={t('accountancy.detachBooking')}
                                                    >
                                                        <CloseIcon sx={{ fontSize: '0.85rem' }} />
                                                    </IconButton>
                                                </>
                                            ) : usedBookingIds.length > 0 ? (
                                                <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
                                                    <Select
                                                        value=""
                                                        displayEmpty
                                                        sx={bulkInlineSelectSx}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            const num =
                                                                typeof v === 'number'
                                                                    ? v
                                                                    : String(v).trim() === ''
                                                                      ? undefined
                                                                      : Number(v);
                                                            if (num != null) updateRow(row.key, { bookingId: num });
                                                        }}
                                                        MenuProps={{ PaperProps: { sx: { maxHeight: 280 } } }}
                                                    >
                                                        <MenuItem value="" disabled sx={{ fontSize: '0.6875rem' }}>
                                                            —
                                                        </MenuItem>
                                                        {usedBookingIds.map((id) => (
                                                            <MenuItem key={id} value={id} sx={{ fontSize: '0.6875rem' }}>
                                                                {bookingLabels[id] ?? `#${id}`}
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            ) : null}
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <FormControl
                                            size="small"
                                            fullWidth
                                            error={!!errors[`row_${index}_category`]}
                                        >
                                            <Select
                                                value={getEffectiveRowCategory(row, category) || ''}
                                                displayEmpty
                                                sx={bulkInlineSelectSx}
                                                onChange={(e) => {
                                                    const v = e.target.value as string;
                                                    const effectiveName = v === category ? category : v;
                                                    const cat = findCategoryByName(
                                                        categories,
                                                        effectiveName,
                                                        transactionType,
                                                    );
                                                    const defaults = resolveCategoryTransactionDefaults(
                                                        cat,
                                                        roomContextFromRow(row, objects),
                                                    );
                                                    const patch: Partial<BulkRow> = {
                                                        rowCategory: v === category ? '' : v,
                                                    };
                                                    if (
                                                        defaults.source &&
                                                        !(
                                                            transactionType === 'expense' &&
                                                            sourceLockedForCashflow
                                                        )
                                                    ) {
                                                        patch.source =
                                                            defaults.source as SourceRecipientOptionValue;
                                                    }
                                                    if (
                                                        defaults.recipient &&
                                                        !(
                                                            transactionType === 'income' &&
                                                            recipientLockedForCashflow
                                                        )
                                                    ) {
                                                        patch.recipient =
                                                            defaults.recipient as SourceRecipientOptionValue;
                                                    }
                                                    if (defaults.pricePerUnit != null) {
                                                        patch.amount = defaults.pricePerUnit;
                                                    }
                                                    updateRow(row.key, patch);
                                                }}
                                                MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}
                                            >
                                                <MenuItem value="" sx={{ fontSize: '0.6875rem' }}>
                                                    —
                                                </MenuItem>
                                                {buildCategoriesForSelect(categories, transactionType).map((c) => (
                                                    <MenuItem key={c.id} value={c.name} sx={{ fontSize: '0.6875rem' }}>
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
                                            prefetchedOptions={sourceRecipientOptions}
                                            hideLabel
                                            popperMinWidth={220}
                                            disabled={transactionType === 'expense' && sourceLockedForCashflow}
                                            sx={bulkSourceRecipientSx}
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
                                            prefetchedOptions={recipientRecipientOptions}
                                            hideLabel
                                            popperMinWidth={220}
                                            disabled={transactionType === 'income' && recipientLockedForCashflow}
                                            sx={bulkSourceRecipientSx}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            size="small"
                                            hiddenLabel
                                            placeholder={t('accountancy.comment')}
                                            value={row.comment}
                                            onChange={(e) => updateRow(row.key, { comment: e.target.value })}
                                            slotProps={{
                                                htmlInput: { 'aria-label': t('accountancy.comment') },
                                            }}
                                            sx={bulkCellTextFieldSx}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            size="small"
                                            hiddenLabel
                                            type="number"
                                            placeholder={t('accountancy.cost')}
                                            value={row.amount ?? ''}
                                            onChange={(e) => handleChangeAmount(row.key, e.target.value)}
                                            error={!!errors[`row_${index}_amount`]}
                                            slotProps={{
                                                htmlInput: {
                                                    min: 0,
                                                    step: 0.01,
                                                    'aria-label': t('accountancy.cost'),
                                                },
                                            }}
                                            sx={bulkCellTextFieldSx}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            size="small"
                                            hiddenLabel
                                            type="number"
                                            placeholder={t('accountancy.quantity')}
                                            value={row.quantity ?? 1}
                                            onChange={(e) => handleChangeQuantity(row.key, e.target.value)}
                                            error={!!errors[`row_${index}_quantity`]}
                                            slotProps={{
                                                htmlInput: {
                                                    min: 1,
                                                    step: 1,
                                                    'aria-label': t('accountancy.quantity'),
                                                },
                                            }}
                                            sx={bulkCellTextFieldSx}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption" sx={{ fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                                            {formatBulkLineTotal(row.quantity, getEffectiveCost(row))}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            size="small"
                                            hiddenLabel
                                            type="date"
                                            value={row.transactionDate}
                                            onChange={(e) =>
                                                updateRow(row.key, { transactionDate: e.target.value })
                                            }
                                            error={!!errors[`row_${index}_transactionDate`]}
                                            slotProps={{
                                                htmlInput: { 'aria-label': t('accountancy.transactionDate') },
                                            }}
                                            sx={bulkCellTextFieldSx}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <FormControl
                                            size="small"
                                            fullWidth
                                            error={!!errors[`row_${index}_status`]}
                                        >
                                            <Select
                                                value={
                                                    transactionType === 'expense' && sourceLockedForCashflow
                                                        ? 'draft'
                                                        : transactionType === 'income' && recipientLockedForCashflow
                                                          ? 'draft'
                                                          : row.status
                                                }
                                                sx={bulkInlineSelectSx}
                                                onChange={(e) =>
                                                    updateRow(row.key, {
                                                        status: e.target.value as ExpenseStatus | IncomeStatus,
                                                    })
                                                }
                                                disabled={
                                                    (transactionType === 'expense' && sourceLockedForCashflow) ||
                                                    (transactionType === 'income' && recipientLockedForCashflow)
                                                }
                                                MenuProps={{ PaperProps: { sx: { maxHeight: 200 } } }}
                                            >
                                                <MenuItem value="draft" sx={{ fontSize: '0.6875rem' }}>
                                                    {t('accountancy.statusDraft')}
                                                </MenuItem>
                                                <MenuItem value="confirmed" sx={{ fontSize: '0.6875rem' }}>
                                                    {t('accountancy.statusConfirmed')}
                                                </MenuItem>
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Checkbox
                                            checked={row.splittable}
                                            onChange={(e) => handleChangeSplittable(row.key, e.target.checked)}
                                            size="small"
                                            inputProps={{
                                                'aria-label': t('accountancy.subtransactionColumn'),
                                            }}
                                        />
                                    </TableCell>
                                    {transactionType === 'expense' && (
                                        <TableCell align="center">
                                            <Checkbox
                                                checked={row.includeInSynthetic}
                                                onChange={(e) =>
                                                    handleChangeIncludeInSynthetic(row.key, e.target.checked)
                                                }
                                                size="small"
                                                inputProps={{
                                                    'aria-label': t('accountancy.divisibility'),
                                                }}
                                            />
                                        </TableCell>
                                    )}
                                    <TableCell align="center">
                                        <FileAttachments
                                            value={row.attachments ?? []}
                                            onChange={(atts: AccountancyAttachment[]) =>
                                                updateRow(row.key, { attachments: atts })
                                            }
                                            disabled={loading}
                                            compact
                                        />
                                    </TableCell>
                                </TableRow>
                                {row.splittable && (
                                    <>
                                        <TableRow sx={bulkGroupSubHeaderRowSx(row.subItems.length === 0)}>
                                            <TableCell colSpan={bulkColCount} sx={{ py: 0.25 }}>
                                                <Stack direction="row" alignItems="center" spacing={1}>
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            fontWeight: 700,
                                                            fontSize: '0.65rem',
                                                            color: 'primary.main',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.04em',
                                                        }}
                                                    >
                                                        {t('accountancy.subtransactions')}
                                                    </Typography>
                                                    {errors[`row_${index}_sub`] && (
                                                        <Typography variant="caption" color="error" sx={{ fontSize: '0.6rem' }}>
                                                            {errors[`row_${index}_sub`]}
                                                        </Typography>
                                                    )}
                                                    <Button
                                                        variant="text"
                                                        size="small"
                                                        startIcon={<AddIcon sx={{ fontSize: '0.9rem !important' }} />}
                                                        onClick={() => handleAddSubItem(row.key)}
                                                        sx={{ minWidth: 0, py: 0, fontSize: '0.65rem' }}
                                                    >
                                                        {t('accountancy.addSubtransaction')}
                                                    </Button>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                        {row.subItems.map((sub, sIdx) => (
                                            <TableRow
                                                key={sub.key}
                                                sx={bulkGroupSubRowSx(sIdx === row.subItems.length - 1)}
                                            >
                                                <TableCell>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleRemoveSubItem(row.key, sub.key)}
                                                        disabled={row.subItems.length <= 1}
                                                        aria-label={t('accountancy.removeItem')}
                                                    >
                                                        <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                                                    </IconButton>
                                                </TableCell>
                                                <TableCell>
                                                    <FormControl size="small" fullWidth>
                                                        <Select
                                                            value={sub.recordKind}
                                                            sx={bulkInlineSelectSx}
                                                            onChange={(e) =>
                                                                handleChangeSubItem(
                                                                    row.key,
                                                                    sub.key,
                                                                    'recordKind',
                                                                    e.target.value as 'expense' | 'income',
                                                                )
                                                            }
                                                        >
                                                            <MenuItem value="expense" sx={{ fontSize: '0.6875rem' }}>
                                                                {t('accountancy.expense')}
                                                            </MenuItem>
                                                            <MenuItem value="income" sx={{ fontSize: '0.6875rem' }}>
                                                                {t('accountancy.income')}
                                                            </MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                </TableCell>
                                                <TableCell>
                                                    <Stack direction="row" spacing={0.25} alignItems="flex-start">
                                                        <Tooltip title={t('accountancy.selectBooking')}>
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() =>
                                                                        handleOpenSubBookingModal(row.key, sub.key)
                                                                    }
                                                                    aria-label={t('accountancy.selectBooking')}
                                                                >
                                                                    <EventNoteIcon sx={{ fontSize: '1rem' }} />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                        {sub.bookingId != null ? (
                                                            <>
                                                                <Typography variant="caption" sx={bulkBookingLabelSx}>
                                                                    {bookingLabels[sub.bookingId] ?? `#${sub.bookingId}`}
                                                                </Typography>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() =>
                                                                        handleDetachSubBooking(row.key, sub.key)
                                                                    }
                                                                    aria-label={t('accountancy.detachBooking')}
                                                                >
                                                                    <CloseIcon sx={{ fontSize: '0.85rem' }} />
                                                                </IconButton>
                                                            </>
                                                        ) : usedBookingIds.length > 0 ? (
                                                            <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
                                                                <Select
                                                                    value=""
                                                                    displayEmpty
                                                                    sx={bulkInlineSelectSx}
                                                                    onChange={(e) => {
                                                                        const v = e.target.value;
                                                                        const num =
                                                                            typeof v === 'number'
                                                                                ? v
                                                                                : String(v).trim() === ''
                                                                                  ? undefined
                                                                                  : Number(v);
                                                                        if (num != null) {
                                                                            handleChangeSubItem(
                                                                                row.key,
                                                                                sub.key,
                                                                                'bookingId',
                                                                                num,
                                                                            );
                                                                        }
                                                                    }}
                                                                >
                                                                    <MenuItem value="" disabled sx={{ fontSize: '0.6875rem' }}>
                                                                        —
                                                                    </MenuItem>
                                                                    {usedBookingIds.map((id) => (
                                                                        <MenuItem key={id} value={id} sx={{ fontSize: '0.6875rem' }}>
                                                                            {bookingLabels[id] ?? `#${id}`}
                                                                        </MenuItem>
                                                                    ))}
                                                                </Select>
                                                            </FormControl>
                                                        ) : null}
                                                    </Stack>
                                                </TableCell>
                                                <TableCell>
                                                    <FormControl
                                                        size="small"
                                                        fullWidth
                                                        error={!!errors[`row_${index}_sub_${sIdx}_category`]}
                                                    >
                                                        <Select
                                                            value={sub.category || ''}
                                                            displayEmpty
                                                            sx={bulkInlineSelectSx}
                                                            onChange={(e) =>
                                                                handleChangeSubItem(
                                                                    row.key,
                                                                    sub.key,
                                                                    'category',
                                                                    e.target.value as string,
                                                                )
                                                            }
                                                            MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}
                                                        >
                                                            <MenuItem value="" sx={{ fontSize: '0.6875rem' }}>
                                                                —
                                                            </MenuItem>
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
                                                                <MenuItem key={cat.id} value={cat.name} sx={{ fontSize: '0.6875rem' }}>
                                                                    {cat.depth > 0
                                                                        ? '\u00A0'.repeat(cat.depth * 2) + '↳ '
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
                                                            handleChangeSubItem(row.key, sub.key, 'source', v)
                                                        }
                                                        label={t('accountancy.source')}
                                                        counterparties={counterparties}
                                                        usersWithCashflow={usersWithCashflow}
                                                        prefetchedOptions={sourceRecipientOptions}
                                                        hideLabel
                                                        popperMinWidth={220}
                                                        sx={bulkSourceRecipientSx}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <SourceRecipientSelect
                                                        value={sub.recipient}
                                                        onChange={(v) =>
                                                            handleChangeSubItem(row.key, sub.key, 'recipient', v)
                                                        }
                                                        label={t('accountancy.recipient')}
                                                        counterparties={counterparties}
                                                        usersWithCashflow={usersWithCashflow}
                                                        cashflows={cashflows}
                                                        includeCashflows
                                                        prefetchedOptions={recipientRecipientOptions}
                                                        hideLabel
                                                        popperMinWidth={220}
                                                        sx={bulkSourceRecipientSx}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        size="small"
                                                        hiddenLabel
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
                                                        sx={bulkCellTextFieldSx}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        size="small"
                                                        hiddenLabel
                                                        type="number"
                                                        placeholder={t('accountancy.cost')}
                                                        value={sub.amount ?? ''}
                                                        onChange={(e) => {
                                                            const num = Number(e.target.value);
                                                            handleChangeSubItem(
                                                                row.key,
                                                                sub.key,
                                                                'amount',
                                                                Number.isFinite(num) && e.target.value !== ''
                                                                    ? num
                                                                    : undefined,
                                                            );
                                                        }}
                                                        error={!!errors[`row_${index}_sub_${sIdx}_amount`]}
                                                        sx={bulkCellTextFieldSx}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        size="small"
                                                        hiddenLabel
                                                        type="number"
                                                        placeholder={t('accountancy.quantity')}
                                                        value={sub.quantity ?? 1}
                                                        onChange={(e) => {
                                                            const num = Number(e.target.value);
                                                            const q =
                                                                Number.isInteger(num) && num >= 1 ? num : 1;
                                                            handleChangeSubItem(
                                                                row.key,
                                                                sub.key,
                                                                'quantity',
                                                                q,
                                                            );
                                                        }}
                                                        error={!!errors[`row_${index}_sub_${sIdx}_quantity`]}
                                                        slotProps={{
                                                            htmlInput: {
                                                                min: 1,
                                                                step: 1,
                                                                'aria-label': t('accountancy.quantity'),
                                                            },
                                                        }}
                                                        sx={bulkCellTextFieldSx}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Typography
                                                        variant="caption"
                                                        sx={{ fontSize: '0.6875rem', whiteSpace: 'nowrap' }}
                                                    >
                                                        {formatBulkLineTotal(sub.quantity, getEffectiveCostSub(sub))}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        size="small"
                                                        hiddenLabel
                                                        type="date"
                                                        value={sub.transactionDate}
                                                        onChange={(e) =>
                                                            handleChangeSubItem(
                                                                row.key,
                                                                sub.key,
                                                                'transactionDate',
                                                                e.target.value,
                                                            )
                                                        }
                                                        error={!!errors[`row_${index}_sub_${sIdx}_transactionDate`]}
                                                        sx={bulkCellTextFieldSx}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <FormControl
                                                        size="small"
                                                        fullWidth
                                                        error={!!errors[`row_${index}_sub_${sIdx}_status`]}
                                                    >
                                                        <Select
                                                            value={sub.status || 'draft'}
                                                            sx={bulkInlineSelectSx}
                                                            onChange={(e) =>
                                                                handleChangeSubItem(
                                                                    row.key,
                                                                    sub.key,
                                                                    'status',
                                                                    e.target.value as ExpenseStatus | IncomeStatus,
                                                                )
                                                            }
                                                        >
                                                            <MenuItem value="draft" sx={{ fontSize: '0.6875rem' }}>
                                                                {t('accountancy.statusDraft')}
                                                            </MenuItem>
                                                            <MenuItem value="confirmed" sx={{ fontSize: '0.6875rem' }}>
                                                                {t('accountancy.statusConfirmed')}
                                                            </MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                </TableCell>
                                                <TableCell />
                                                {transactionType === 'expense' && <TableCell />}
                                                <TableCell align="center">
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
                                                        compact
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </>
                                )}
                                {index < rows.length - 1 && (
                                    <TableRow aria-hidden>
                                        <TableCell
                                            colSpan={bulkColCount}
                                            sx={{
                                                height: 10,
                                                p: 0,
                                                border: 'none !important',
                                                bgcolor: 'background.default',
                                            }}
                                        />
                                    </TableRow>
                                )}
                            </Fragment>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button variant="outlined" size="small" onClick={() => router.back()}>
                    {t('common.cancel')}
                </Button>
                <Button variant="contained" size="small" endIcon={<SendIcon fontSize="small" />} onClick={handleSubmit} disabled={loading}>
                    {t('common.send')}
                </Button>
            </Stack>

            <BookingSelectModal
                open={bookingModalTarget !== null}
                onClose={handleCloseBookingModal}
                onSelect={handleBookingSelect}
                initialObjectId={bookingModalObjectId}
                reportMonth={reportMonth}
                initialRoomId={bookingModalInitialRoomId}
            />
            {DuplicateDialog}
        </>
    );
}

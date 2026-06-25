'use client';

import {
    Box,
    Button,
    Checkbox,
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
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EventNoteIcon from '@mui/icons-material/EventNote';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { AccountancyCategory, AccountancyAttachment, Booking, Expense, Income, ExpenseStatus, UserObject } from '@/lib/types';
import { formatTitle } from '@/lib/format';
import { getExpenseById } from '@/lib/expenses';
import { getIncomeById } from '@/lib/incomes';
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
import { getCashflows } from '@/lib/cashflows';
import { getUsersWithCashflow } from '@/lib/users';
import FileAttachments from '@/components/accountancy/FileAttachments';
import SourceRecipientSelect, {
    buildSourceRecipientAutocompleteOptions,
    type SourceRecipientOptionValue,
} from '@/components/accountancy/SourceRecipientSelect';
import {
    COMPACT_COL_AMOUNT,
    COMPACT_COL_ATTACH,
    COMPACT_COL_BOOKING,
    COMPACT_COL_CAT,
    COMPACT_COL_COMMENT,
    COMPACT_COL_DATE,
    COMPACT_COL_DEL,
    COMPACT_COL_DIVISIBILITY,
    COMPACT_COL_PARTY,
    COMPACT_COL_QTY,
    COMPACT_COL_STATUS,
    COMPACT_COL_SUB_TX,
    COMPACT_COL_SUM,
    TXN_ADD_TABLE_MIN_WIDTH_PX,
    compactCellTextFieldSx,
    compactBookingLabelSx,
    compactGroupParentRowSx,
    compactGroupSubHeaderRowSx,
    compactGroupSubRowSx,
    compactInlineSelectSx,
    compactRoomSelectSx,
    compactSourceRecipientSx,
    compactTableSx,
    formatCompactLineTotal,
    txnAddTableColCount,
} from '@/lib/accountancyCompactTableStyles';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useRouter, useSearchParams } from 'next/navigation';
import RoomsMultiSelect from '@/components/objectsMultiSelect/RoomsMultiSelect';
import BookingSelectModal from '@/components/bookingsModal/BookingSelectModal';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';
import { buildCategoryNameByIdMap, findCategoryByName, resolveCategoryName, resolveCategorySourceRecipientValue, resolveCategoryTransactionDefaults } from '@/lib/accountancyCategoryResolve';
import { formatRoomSourceRecipient } from '@/lib/roomBinding';
import { isResolvableRoomContextToken } from '@/lib/sourceRecipientParse';
import { resolveDistrictForObjectId } from '@/lib/sourceRecipientDistrictFunds';
import { useObjects } from '@/providers/ObjectsProvider';
import {
    getAmountFieldDisplayValue,
    parseDecimalInput,
    sanitizeDecimalTyping,
} from '@/lib/accountancyUtils';

type LineFields = {
    category: string;
    amount: number | undefined;
    /** Промежуточный текст в поле стоимости (например «.» или «1,»). */
    amountInput?: string;
    quantity: number;
    date: string;
    reportMonth: string;
    comment: string;
    source: SourceRecipientOptionValue | '';
    recipient: SourceRecipientOptionValue | '';
    attachments: AccountancyAttachment[];
    bookingId: number | undefined;
    status: ExpenseStatus;
};

type SubItemForm = LineFields & {
    recordKind: 'expense' | 'income';
};

type ItemForm = LineFields & {
    splittable: boolean;
    /** Учитывать в расчёте синтетических транзакций сводки (только расход) */
    includeInSynthetic: boolean;
    subItems: SubItemForm[];
};

type ParentTransactionContext = {
    id: string;
    type: 'expense' | 'income';
    label: string;
};

function createDefaultLineFields(): LineFields {
    return {
        category: '',
        amount: undefined,
        quantity: 1,
        date: '',
        reportMonth: '',
        comment: '',
        source: '',
        recipient: '',
        attachments: [],
        bookingId: undefined,
        status: 'draft',
    };
}

function createDefaultSubItem(defaultRecordKind: 'expense' | 'income' = 'expense'): SubItemForm {
    return {
        ...createDefaultLineFields(),
        recordKind: defaultRecordKind,
    };
}

/** Подстрока: тип противоположен форме; «От кого»/«Кому» — поменять местами с родителем, если хотя бы одно заполнено. */
function buildSubItemFromParent(
    parent: LineFields,
    formType: 'expense' | 'income',
    objectId: number | undefined,
    roomName: string | undefined,
    sharedReportMonth: string,
): SubItemForm {
    const recordKind: 'expense' | 'income' = formType === 'expense' ? 'income' : 'expense';
    const sub = createDefaultSubItem(recordKind);
    const hasParties =
        String(parent.source ?? '').trim() !== '' || String(parent.recipient ?? '').trim() !== '';
    if (hasParties) {
        sub.source = parent.recipient as SourceRecipientOptionValue | '';
        sub.recipient = parent.source as SourceRecipientOptionValue | '';
    } else if (objectId != null && roomName != null) {
        const roomValue = formatRoomSourceRecipient(objectId, roomName);
        if (recordKind === 'expense') sub.source = roomValue;
        else sub.recipient = roomValue;
    }
    if (sharedReportMonth) {
        sub.date = reportMonthToFirstDayString(sharedReportMonth);
    }
    return sub;
}

function createDefaultItem(): ItemForm {
    return {
        ...createDefaultLineFields(),
        splittable: false,
        includeInSynthetic: true,
        subItems: [],
    };
}

/** YYYY-MM → первый день месяца YYYY-MM-DD (для input type="date") */
function reportMonthToFirstDayString(reportMonth: string): string {
    if (!/^\d{4}-\d{2}$/.test(reportMonth)) return '';
    return `${reportMonth}-01`;
}

function stableTxnRoomLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

interface TransactionAddFormProps {
    type: 'expense' | 'income';
    /** Только для страниц «Мой кэшфлоу»: записать cashflowId пользователя в новую транзакцию */
    attachCashflowId?: boolean;
}

export default function TransactionAddForm({ type, attachCashflowId = false }: TransactionAddFormProps) {
    const { t, language } = useTranslation();
    const router = useRouter();
    const searchParams = useSearchParams();
    const parentExpenseId = searchParams.get('parentExpenseId')?.trim() ?? '';
    const parentIncomeId = searchParams.get('parentIncomeId')?.trim() ?? '';
    const isSubtransactionMode = Boolean(parentExpenseId || parentIncomeId);
    const { isAdmin, isAccountant, user } = useUser();
    const { objects } = useObjects();
    const [selectedObjects, setSelectedObjects] = useState<UserObject[]>([]);
    const [objectId, setObjectId] = useState<number | undefined>();
    const [roomName, setRoomName] = useState<string | undefined>();
    const [items, setItems] = useState<ItemForm[]>([createDefaultItem()]);
    const [bookingModalTarget, setBookingModalTarget] = useState<
        | { kind: 'main'; index: number }
        | { kind: 'sub'; parentIndex: number; subIndex: number }
        | null
    >(null);
    const [bookingLabels, setBookingLabels] = useState<Record<number, string>>({});
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);
    /** Категории доходов для подтранзакций на форме расхода */
    const [subIncomeCategories, setSubIncomeCategories] = useState<AccountancyCategory[]>([]);
    /** Категории расходов для подтранзакций на форме прихода */
    const [subExpenseCategories, setSubExpenseCategories] = useState<AccountancyCategory[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [cashflows, setCashflows] = useState<{ _id: string; name: string }[]>([]);
    const [usersWithCashflow, setUsersWithCashflow] = useState<{ _id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { setSnackbar } = useSnackbar();
    const { askOnDuplicate, DuplicateDialog } = useDuplicateTransactionDialog();
    /** Кэшфлоу текущего пользователя (как на /dashboard/cashflow), без query в URL */
    const [userCashflowId, setUserCashflowId] = useState<string | undefined>();
    /** Месяц отчёта YYYY-MM, общий для всех позиций (расходы и приходы) */
    const [sharedReportMonth, setSharedReportMonth] = useState('');
    const [parentTransaction, setParentTransaction] = useState<ParentTransactionContext | null>(null);

    const reportMonthOptions = useMemo(
        () =>
            Array.from({ length: 24 }, (_, i) => {
                const now = new Date();
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const y = d.getFullYear();
                const m = d.getMonth() + 1;
                const value = `${y}-${String(m).padStart(2, '0')}`;
                return { value, label: `${t(`accountancy.months.${m}`)} ${y}` };
            }),
        [t]
    );

    const hasAccess = isAdmin || isAccountant || Boolean(user?.hasCashflow);
    const currentUserId = user?._id?.toString?.() ?? (user as { _id?: string } | undefined)?._id;

    const formatParentTransactionLabel = (
        record: Expense | Income,
        recordType: 'expense' | 'income',
        id: string
    ) => {
        const total = ((record.quantity ?? 1) * (record.amount ?? 0)).toLocaleString('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        const typeLabel = recordType === 'expense' ? t('accountancy.expense') : t('accountancy.income');
        const nameById = buildCategoryNameByIdMap([
            ...subIncomeCategories,
            ...subExpenseCategories,
            ...categories,
        ], language);
        const categoryLabel = resolveCategoryName(record, nameById);
        return `${typeLabel}: ${categoryLabel} - ${total} (#${id})`;
    };

    const applySharedReportMonth = (value: string) => {
        setSharedReportMonth(value);
        if (type !== 'expense' && type !== 'income') return;
        const first = value ? reportMonthToFirstDayString(value) : '';
        if (!first) return;
        setItems((prev) =>
            prev.map((item) => ({
                ...item,
                date: first,
                subItems: item.subItems.map((sub) => ({ ...sub, date: first })),
            }))
        );
    };

    useEffect(() => {
        if (!hasAccess) return;
        const load = async () => {
            try {
                const [cps, cfs, usersCf] = await Promise.all([
                    getCounterparties(),
                    getCashflows(),
                    getUsersWithCashflow(),
                ]);
                setCounterparties(cps.map((c) => ({ _id: c._id!, name: c.name })));
                setCashflows(cfs.map((c) => ({ _id: c._id!, name: c.name })));
                setUsersWithCashflow(usersCf);
                const userCf = currentUserId ? cfs.find((cf) => cf.userId === currentUserId) : undefined;
                setUserCashflowId(attachCashflowId ? userCf?._id : undefined);

                if (type === 'expense') {
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
            } catch (error) {
                console.error('Error loading data:', error);
            }
        };
        void load();
    }, [attachCashflowId, currentUserId, hasAccess, type]);

    useEffect(() => {
        if (!hasAccess || !isSubtransactionMode) return;

        let cancelled = false;

        const loadParentTransaction = async () => {
            if (parentExpenseId && parentIncomeId) {
                setSnackbar({
                    open: true,
                    message: t('common.error'),
                    severity: 'error',
                });
                router.push(`/dashboard/accountancy/${type}/add`);
                return;
            }

            try {
                const parentType = parentExpenseId ? 'expense' : 'income';
                const parentId = parentExpenseId || parentIncomeId;
                const found =
                    parentType === 'expense'
                        ? await getExpenseById(parentId)
                        : await getIncomeById(parentId);

                if (cancelled) return;

                if (!found) {
                    setSnackbar({
                        open: true,
                        message:
                            parentType === 'expense'
                                ? t('accountancy.expenseNotFound')
                                : t('accountancy.incomeNotFound'),
                        severity: 'error',
                    });
                    router.push(`/dashboard/accountancy/${type}/add`);
                    return;
                }

                const parentRoomName = found.roomName ? String(found.roomName) : undefined;
                setParentTransaction({
                    id: parentId,
                    type: parentType,
                    label: formatParentTransactionLabel(found, parentType, parentId),
                });
                setObjectId(found.objectId);
                setRoomName(parentRoomName);
                setSelectedObjects([
                    {
                        id: found.objectId,
                        rooms: parentRoomName ? [parentRoomName] : [],
                    },
                ]);
                if (found.reportMonth) {
                    setSharedReportMonth(found.reportMonth);
                    const firstDay = reportMonthToFirstDayString(found.reportMonth);
                    setItems((prev) =>
                        prev.map((item) => ({
                            ...item,
                            date: item.date || firstDay,
                            subItems: [],
                            splittable: false,
                        }))
                    );
                } else {
                    setItems((prev) =>
                        prev.map((item) => ({
                            ...item,
                            subItems: [],
                            splittable: false,
                        }))
                    );
                }
            } catch (error) {
                console.error('Error loading parent transaction:', error);
                if (!cancelled) {
                    setSnackbar({
                        open: true,
                        message: t('common.serverError'),
                        severity: 'error',
                    });
                }
            }
        };

        void loadParentTransaction();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAccess, isSubtransactionMode, parentExpenseId, parentIncomeId, router, type]);

    const handleChangeObject = (value: UserObject[]) => {
        setSelectedObjects(value);
        const objId = value.length > 0 ? value[0].id : undefined;
        const rPick = value.length > 0 && value[0].rooms.length > 0 ? value[0].rooms[0] : undefined;
        const rName = rPick !== undefined ? String(rPick) : undefined;
        setObjectId(objId);
        setRoomName(rName);
        const roomValue: SourceRecipientOptionValue | '' =
            objId != null && rName != null ? formatRoomSourceRecipient(objId, rName) : '';
        const district = resolveDistrictForObjectId(objects, objId);
        const srContext = { objectId: objId, roomName: rName, district, objects };
        const resolveField = (
            v: SourceRecipientOptionValue | '',
            field: 'source' | 'recipient',
        ): SourceRecipientOptionValue | '' => {
            const resolved = resolveCategorySourceRecipientValue(v, srContext);
            if (resolved) return resolved as SourceRecipientOptionValue;
            if (isResolvableRoomContextToken(v)) return v;
            if (field === 'source' && type === 'expense' && roomValue) return roomValue;
            if (field === 'recipient' && type === 'income' && roomValue) return roomValue;
            return v;
        };
        const applyItemFromContext = (item: ItemForm): ItemForm => {
            const cat = findCategoryByName(categories, item.category, type);
            const defaults = cat ? resolveCategoryTransactionDefaults(cat, srContext) : {};
            const next: ItemForm = {
                ...item,
                source: (defaults.source ??
                    resolveField(item.source, 'source')) as SourceRecipientOptionValue,
                recipient: (defaults.recipient ??
                    resolveField(item.recipient, 'recipient')) as SourceRecipientOptionValue,
                amount: defaults.pricePerUnit != null ? defaults.pricePerUnit : item.amount,
                subItems: item.subItems.map((sub) => {
                    const subCat = findCategoryByName(
                        sub.recordKind === 'income'
                            ? type === 'expense'
                                ? subIncomeCategories
                                : categories
                            : type === 'expense'
                              ? categories
                              : subExpenseCategories,
                        sub.category,
                        sub.recordKind,
                    );
                    const subDefaults = subCat
                        ? resolveCategoryTransactionDefaults(subCat, srContext)
                        : {};
                    return {
                        ...sub,
                        source: (subDefaults.source ??
                            resolveField(sub.source, 'source')) as SourceRecipientOptionValue,
                        recipient: (subDefaults.recipient ??
                            resolveField(sub.recipient, 'recipient')) as SourceRecipientOptionValue,
                        amount:
                            subDefaults.pricePerUnit != null ? subDefaults.pricePerUnit : sub.amount,
                    };
                }),
            };
            return next;
        };
        setItems((prev) => prev.map(applyItemFromContext));
        setErrors((prev) => {
            const next = { ...prev };
            if (objId) delete next.objectId;
            return next;
        });
    };

    const handleAddItem = () => {
        const newItem = createDefaultItem();
        if (objectId != null && roomName != null) {
            if (type === 'expense') newItem.source = formatRoomSourceRecipient(objectId, roomName);
            else newItem.recipient = formatRoomSourceRecipient(objectId, roomName);
        }
        if (sharedReportMonth) {
            newItem.date = reportMonthToFirstDayString(sharedReportMonth);
        }
        setItems((prev) => [...prev, newItem]);
    };

    const handleRemoveItem = (index: number) => {
        if (items.length <= 1) return;
        setItems((prev) => prev.filter((_, i) => i !== index));
    };

    const handleChangeItem = (index: number, field: keyof ItemForm, value: unknown) => {
        setItems((prev) =>
            prev.map((item, i) => {
                if (i !== index) return item;
                const next = { ...item, [field]: value } as ItemForm;
                if (field === 'category') {
                    const cat = findCategoryByName(categories, String(value), type);
                    const defaults = resolveCategoryTransactionDefaults(cat, {
                        objectId,
                        roomName,
                        district: resolveDistrictForObjectId(objects, objectId),
                        objects,
                    });
                    if (defaults.source) next.source = defaults.source as SourceRecipientOptionValue;
                    if (defaults.recipient) next.recipient = defaults.recipient as SourceRecipientOptionValue;
                    if (defaults.pricePerUnit != null) {
                        next.amount = defaults.pricePerUnit;
                        next.amountInput = undefined;
                    }
                }
                return next;
            }),
        );
        setErrors((prev) => {
            const next = { ...prev };
            delete next[`item_${index}_${field}`];
            return next;
        });
    };

    const handleChangeItemAmount = (
        index: number,
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const amountInput = sanitizeDecimalTyping(event.target.value);
        const parsed = parseDecimalInput(amountInput);
        setItems((prev) =>
            prev.map((item, i) =>
                i === index
                    ? { ...item, amountInput, amount: parsed ?? undefined }
                    : item,
            ),
        );
        setErrors((prev) => {
            const next = { ...prev };
            delete next[`item_${index}_amount`];
            return next;
        });
    };

    const handleChangeItemQuantity = (
        index: number,
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const num = Number(event.target.value);
        const q = Number.isInteger(num) && num >= 1 ? num : 1;
        handleChangeItem(index, 'quantity', q);
    };

    const getEffectiveCostMain = (item: LineFields): number => {
        if (item.amountInput !== undefined && item.amountInput.trim() !== '') {
            const parsed = parseDecimalInput(item.amountInput);
            if (parsed != null) return parsed;
            return 0;
        }
        if (item.amount != null) return item.amount;
        const cat = categories.find((c) => c.name === item.category);
        return cat?.pricePerUnit ?? 0;
    };

    const getEffectiveCostSub = (sub: SubItemForm): number => {
        if (sub.amountInput !== undefined && sub.amountInput.trim() !== '') {
            const parsed = parseDecimalInput(sub.amountInput);
            if (parsed != null) return parsed;
            return 0;
        }
        if (sub.amount != null) return sub.amount;
        const list =
            sub.recordKind === 'income'
                ? type === 'expense'
                    ? subIncomeCategories
                    : categories
                : type === 'expense'
                  ? categories
                  : subExpenseCategories;
        const cat = list.find((c) => c.name === sub.category);
        return cat?.pricePerUnit ?? 0;
    };

    const handleChangeSplittable = (index: number, checked: boolean) => {
        setItems((prev) =>
            prev.map((item, i) => {
                if (i !== index) return item;
                if (!checked) return { ...item, splittable: false, subItems: [] };
                let subItems = item.subItems;
                if (subItems.length === 0) {
                    subItems = [buildSubItemFromParent(item, type, objectId, roomName, sharedReportMonth)];
                }
                return { ...item, splittable: true, subItems };
            })
        );
    };

    const handleChangeIncludeInSynthetic = (index: number, checked: boolean) => {
        setItems((prev) =>
            prev.map((item, i) => (i === index ? { ...item, includeInSynthetic: checked } : item))
        );
    };

    const handleChangeSubItem = (
        parentIndex: number,
        subIndex: number,
        field: keyof SubItemForm,
        value: unknown
    ) => {
        setItems((prev) =>
            prev.map((item, i) => {
                if (i !== parentIndex) return item;
                const subItems = item.subItems.map((sub, j) => {
                    if (j !== subIndex) return sub;
                    const next = { ...sub, [field]: value } as SubItemForm;
                    if (field === 'recordKind') return { ...next, category: '' };
                    if (field === 'category') {
                        const list =
                            next.recordKind === 'income'
                                ? type === 'expense'
                                    ? subIncomeCategories
                                    : categories
                                : type === 'expense'
                                  ? categories
                                  : subExpenseCategories;
                        const cat = findCategoryByName(list, String(value), next.recordKind);
                        const defaults = resolveCategoryTransactionDefaults(cat, {
                            objectId,
                            roomName,
                            district: resolveDistrictForObjectId(objects, objectId),
                            objects,
                        });
                        if (defaults.source) next.source = defaults.source as SourceRecipientOptionValue;
                        if (defaults.recipient) next.recipient = defaults.recipient as SourceRecipientOptionValue;
                        if (defaults.pricePerUnit != null) {
                            next.amount = defaults.pricePerUnit;
                            next.amountInput = undefined;
                        }
                    }
                    return next;
                });
                return { ...item, subItems };
            })
        );
        setErrors((prev) => {
            const next = { ...prev };
            delete next[`item_${parentIndex}_sub_${subIndex}_${String(field)}`];
            if (field === 'recordKind') {
                delete next[`item_${parentIndex}_sub_${subIndex}_category`];
            }
            return next;
        });
    };

    const handleChangeSubItemAmount = (
        parentIndex: number,
        subIndex: number,
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const amountInput = sanitizeDecimalTyping(event.target.value);
        const parsed = parseDecimalInput(amountInput);
        setItems((prev) =>
            prev.map((item, i) => {
                if (i !== parentIndex) return item;
                const subItems = item.subItems.map((sub, j) =>
                    j === subIndex
                        ? { ...sub, amountInput, amount: parsed ?? undefined }
                        : sub,
                );
                return { ...item, subItems };
            }),
        );
        setErrors((prev) => {
            const next = { ...prev };
            delete next[`item_${parentIndex}_sub_${subIndex}_amount`];
            return next;
        });
    };

    const handleChangeSubItemQuantity = (
        parentIndex: number,
        subIndex: number,
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const num = Number(event.target.value);
        const q = Number.isInteger(num) && num >= 1 ? num : 1;
        handleChangeSubItem(parentIndex, subIndex, 'quantity', q);
    };

    const handleAddSubItem = (parentIndex: number) => {
        setItems((prev) =>
            prev.map((item, i) => {
                if (i !== parentIndex) return item;
                const newSub = buildSubItemFromParent(
                    item,
                    type,
                    objectId,
                    roomName,
                    sharedReportMonth,
                );
                return { ...item, subItems: [...item.subItems, newSub] };
            }),
        );
    };

    const handleRemoveSubItem = (parentIndex: number, subIndex: number) => {
        setItems((prev) =>
            prev.map((item, i) => {
                if (i !== parentIndex) return item;
                if (item.subItems.length <= 1) return item;
                return {
                    ...item,
                    subItems: item.subItems.filter((_, j) => j !== subIndex),
                };
            })
        );
    };

    const handleDetachSubBooking = (parentIndex: number, subIndex: number) =>
        handleChangeSubItem(parentIndex, subIndex, 'bookingId', undefined);

    const validate = (): boolean => {
        const errs: Record<string, string> = {};

        if (!objectId) errs.objectId = t('accountancy.objectError');

        const validateLine = (
            line: LineFields,
            keyPrefix: string,
            dateKey: string,
            requireStatus: boolean
        ) => {
            if (!line.category) errs[`${keyPrefix}_category`] = t('accountancy.category');
            if (!line.date) errs[`${keyPrefix}_date`] = t(dateKey);
            const eff =
                'recordKind' in line
                    ? getEffectiveCostSub(line as SubItemForm)
                    : getEffectiveCostMain(line);
            const amountRaw = getAmountFieldDisplayValue(line.amount, line.amountInput);
            if (
                (amountRaw !== '' && parseDecimalInput(amountRaw) === null) ||
                eff < 0
            ) {
                errs[`${keyPrefix}_amount`] = t('accountancy.invalidTotalAmount');
            }
            if (line.quantity != null && (line.quantity < 1 || !Number.isInteger(line.quantity)))
                errs[`${keyPrefix}_quantity`] = t('accountancy.quantity');
            if (requireStatus && !line.status) errs[`${keyPrefix}_status`] = t('accountancy.status');
        };

        items.forEach((item, index) => {
            validateLine(
                item,
                `item_${index}`,
                type === 'expense' ? 'accountancy.expenseDate' : 'accountancy.incomeDate',
                type === 'expense'
            );
            if ((type === 'expense' || type === 'income') && item.splittable) {
                if (item.subItems.length === 0) {
                    errs[`item_${index}_sub`] = t('accountancy.subtransactionsRequired');
                }
                item.subItems.forEach((sub, sIdx) => {
                    validateLine(
                        sub,
                        `item_${index}_sub_${sIdx}`,
                        sub.recordKind === 'expense'
                            ? 'accountancy.expenseDate'
                            : 'accountancy.incomeDate',
                        true
                    );
                });
            }
        });

        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            setSnackbar({ open: true, message: t('accountancy.formErrors'), severity: 'error' });
            return false;
        }

        return true;
    };

    const usedBookingIds = useMemo(() => {
        const ids: number[] = [];
        for (const i of items) {
            if (i.bookingId != null) ids.push(i.bookingId);
            for (const s of i.subItems) {
                if (s.bookingId != null) ids.push(s.bookingId);
            }
        }
        return Array.from(new Set(ids));
    }, [items]);

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
                language,
            }),
        [objects, counterparties, usersWithCashflow, t, language],
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
                language,
            }),
        [objects, counterparties, usersWithCashflow, cashflows, t, language],
    );

    const handleOpenBookingModal = (index: number) => setBookingModalTarget({ kind: 'main', index });
    const handleOpenSubBookingModal = (parentIndex: number, subIndex: number) =>
        setBookingModalTarget({ kind: 'sub', parentIndex, subIndex });
    const handleCloseBookingModal = () => setBookingModalTarget(null);

    const handleBookingSelect = (booking: Booking) => {
        if (!bookingModalTarget) return;
        if (bookingModalTarget.kind === 'main') {
            handleChangeItem(bookingModalTarget.index, 'bookingId', booking.id);
        } else {
            handleChangeSubItem(
                bookingModalTarget.parentIndex,
                bookingModalTarget.subIndex,
                'bookingId',
                booking.id
            );
        }
        setBookingLabels((prev) => ({
            ...prev,
            [booking.id]: formatTitle(booking.firstName, booking.lastName, booking.title),
        }));
        setBookingModalTarget(null);
    };

    const handleDetachBooking = (index: number) => handleChangeItem(index, 'bookingId', undefined);

    const handleSubmit = async () => {
        if (isSubtransactionMode && !parentTransaction) {
            setSnackbar({ open: true, message: t('common.loading'), severity: 'warning' });
            return;
        }

        if (!validate() || !objectId) return;

        setLoading(true);
        let successCount = 0;
        const failures: { category: string; message: string }[] = [];
        const duplicateOpts = { onDuplicateConflict: askOnDuplicate };
        const cfId = attachCashflowId ? userCashflowId : undefined;
        const categoryContext = {
            objectId,
            roomName,
            district: resolveDistrictForObjectId(objects, objectId),
            objects,
        };
        const resolveSr = (v: SourceRecipientOptionValue | '' | undefined) =>
            resolveCategorySourceRecipientValue(v, categoryContext);
        const parentLink =
            parentTransaction?.type === 'expense'
                ? { parentExpenseId: parentTransaction.id }
                : parentTransaction?.type === 'income'
                  ? { parentIncomeId: parentTransaction.id }
                  : {};

        try {
            for (const item of items) {
                const effectiveCost = getEffectiveCostMain(item);
                try {
                    let res;
                    if (type === 'expense') {
                        const basePayload: Expense = {
                            objectId,
                            roomName,
                            bookingId: item.bookingId,
                            source: resolveSr(item.source),
                            recipient: resolveSr(item.recipient),
                            cashflowId: cfId,
                            category: item.category,
                            amount: effectiveCost,
                            quantity: item.quantity ?? 1,
                            date: new Date(item.date),
                            comment: item.comment || '',
                            status: item.status,
                            reportMonth: sharedReportMonth || undefined,
                            attachments: item.attachments ?? [],
                            accountantId: '',
                            includeInSynthetic: item.includeInSynthetic,
                            ...parentLink,
                        };
                        if (item.splittable) {
                            const parentRes = await addExpenseHandlingDuplicate(basePayload, duplicateOpts);
                            if (parentRes.skipped) continue;
                            if (!parentRes.success || !parentRes.id) {
                                failures.push({
                                    category: item.category,
                                    message: parentRes.message || t('common.serverError'),
                                });
                                continue;
                            }
                            successCount++;
                            const parentId = parentRes.id;
                            for (const sub of item.subItems) {
                                const subCost = getEffectiveCostSub(sub);
                                try {
                                    if (sub.recordKind === 'expense') {
                                        const subPayload: Expense = {
                                            objectId,
                                            roomName,
                                            bookingId: sub.bookingId,
                                            source: resolveSr(sub.source),
                                            recipient: resolveSr(sub.recipient),
                                            cashflowId: cfId,
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: sub.quantity ?? 1,
                                            date: new Date(sub.date),
                                            comment: sub.comment || '',
                                            status: sub.status,
                                            reportMonth: sharedReportMonth || undefined,
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
                                            cashflowId: cfId,
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: sub.quantity ?? 1,
                                            date: new Date(sub.date),
                                            status: sub.status,
                                            reportMonth: sharedReportMonth || undefined,
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
                        res = await addExpenseHandlingDuplicate(basePayload, duplicateOpts);
                    } else {
                        const baseIncomePayload: Income = {
                            objectId,
                            roomName,
                            bookingId: item.bookingId,
                            cashflowId: cfId,
                            category: item.category,
                            amount: effectiveCost,
                            quantity: item.quantity ?? 1,
                            date: new Date(item.date),
                            status: 'draft',
                            reportMonth: sharedReportMonth || undefined,
                            source: resolveSr(item.source),
                            recipient: resolveSr(item.recipient),
                            comment: item.comment || undefined,
                            attachments: item.attachments ?? [],
                            accountantId: '',
                            ...parentLink,
                        };
                        if (item.splittable) {
                            const parentRes = await addIncomeHandlingDuplicate(baseIncomePayload, duplicateOpts);
                            if (parentRes.skipped) continue;
                            if (!parentRes.success || !parentRes.id) {
                                failures.push({
                                    category: item.category,
                                    message: parentRes.message || t('common.serverError'),
                                });
                                continue;
                            }
                            successCount++;
                            const parentId = parentRes.id;
                            for (const sub of item.subItems) {
                                const subCost = getEffectiveCostSub(sub);
                                try {
                                    if (sub.recordKind === 'expense') {
                                        const subPayload: Expense = {
                                            objectId,
                                            roomName,
                                            bookingId: sub.bookingId,
                                            source: resolveSr(sub.source),
                                            recipient: resolveSr(sub.recipient),
                                            cashflowId: cfId,
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: sub.quantity ?? 1,
                                            date: new Date(sub.date),
                                            comment: sub.comment || '',
                                            status: sub.status,
                                            reportMonth: sharedReportMonth || undefined,
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
                                            cashflowId: cfId,
                                            category: sub.category,
                                            amount: subCost,
                                            quantity: sub.quantity ?? 1,
                                            date: new Date(sub.date),
                                            status: sub.status,
                                            reportMonth: sharedReportMonth || undefined,
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
                        res = await addIncomeHandlingDuplicate(baseIncomePayload, duplicateOpts);
                    }
                    if (isTransactionAdded(res!)) successCount++;
                    else if (isTransactionFailed(res!)) failures.push({ category: item.category, message: res!.message || t('common.serverError') });
                } catch (err) {
                    failures.push({
                        category: item.category,
                        message: getApiErrorMessage(err, t('common.serverError')),
                    });
                }
            }

            const failCount = failures.length;
            const successKey =
                type === 'expense' ? 'accountancy.expensesAdded' : 'accountancy.incomesAdded';
            const message =
                failCount === 0
                    ? `${t(successKey)}: ${successCount}`
                    : formatPartialTransactionAddWarning(t, type, successCount, failures);

            setSnackbar({ open: true, message, severity: failCount === 0 ? 'success' : 'warning' });

            if (successCount > 0) router.back();
        } catch (error) {
            console.error('Error adding transactions:', error);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const bookingModalInitialRoomId = useMemo(() => {
        if (!objectId || roomName == null || roomName === '') return undefined;
        const o = objects.find((x) => x.id === objectId);
        const want = String(roomName).trim();
        const rt = o?.roomTypes?.find((r) => stableTxnRoomLabel(r) === want);
        return rt?.id;
    }, [objects, objectId, roomName]);

    const titleKey = type === 'expense' ? 'accountancy.addExpense' : 'accountancy.addIncome';
    const dateLabelKey = type === 'expense' ? 'accountancy.expenseDate' : 'accountancy.incomeDate';

    const tableColCount = txnAddTableColCount({ type, isSubtransactionMode });

    const renderSubTransactionRow = (
        sub: SubItemForm,
        parentIndex: number,
        subIndex: number,
        isLast: boolean,
    ) => (
        <TableRow key={`${parentIndex}-sub-${subIndex}`} sx={compactGroupSubRowSx(isLast)}>
            <TableCell>
                <IconButton
                    size="small"
                    onClick={() => handleRemoveSubItem(parentIndex, subIndex)}
                    disabled={items[parentIndex]?.subItems.length <= 1}
                    aria-label={t('accountancy.removeItem')}
                >
                    <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
            </TableCell>
            <TableCell>
                <Stack spacing={0.25}>
                    <FormControl size="small" fullWidth>
                        <Select
                            value={sub.recordKind}
                            sx={compactInlineSelectSx}
                            onChange={(e) =>
                                handleChangeSubItem(
                                    parentIndex,
                                    subIndex,
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
                    <Stack direction="row" spacing={0.25} alignItems="flex-start">
                        <Tooltip title={t('accountancy.selectBooking')}>
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={() => handleOpenSubBookingModal(parentIndex, subIndex)}
                                    aria-label={t('accountancy.selectBooking')}
                                >
                                    <EventNoteIcon sx={{ fontSize: '1rem' }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        {sub.bookingId != null ? (
                            <>
                                <Typography variant="caption" sx={compactBookingLabelSx}>
                                    {bookingLabels[sub.bookingId] ?? `#${sub.bookingId}`}
                                </Typography>
                                <IconButton
                                    size="small"
                                    onClick={() => handleDetachSubBooking(parentIndex, subIndex)}
                                    aria-label={t('accountancy.detachBooking')}
                                >
                                    <CloseIcon sx={{ fontSize: '0.85rem' }} />
                                </IconButton>
                            </>
                        ) : null}
                    </Stack>
                </Stack>
            </TableCell>
            <TableCell>
                <FormControl
                    size="small"
                    fullWidth
                    error={!!errors[`item_${parentIndex}_sub_${subIndex}_category`]}
                >
                    <Select
                        value={sub.category || ''}
                        displayEmpty
                        sx={compactInlineSelectSx}
                        onChange={(e) =>
                            handleChangeSubItem(parentIndex, subIndex, 'category', e.target.value as string)
                        }
                        MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}
                    >
                        <MenuItem value="" sx={{ fontSize: '0.6875rem' }}>
                            —
                        </MenuItem>
                        {buildCategoriesForSelect(
                            sub.recordKind === 'income'
                                ? type === 'expense'
                                    ? subIncomeCategories
                                    : categories
                                : type === 'expense'
                                  ? categories
                                  : subExpenseCategories,
                            sub.recordKind,
                            { language },
                        ).map((cat) => (
                            <MenuItem key={cat.id} value={cat.name} sx={{ fontSize: '0.6875rem' }}>
                                {cat.depth > 0 ? '\u00A0'.repeat(cat.depth * 2) + '↳ ' : ''}
                                {cat.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </TableCell>
            <TableCell>
                <SourceRecipientSelect
                    value={sub.source}
                    onChange={(v) => handleChangeSubItem(parentIndex, subIndex, 'source', v)}
                    label={t('accountancy.source')}
                    counterparties={counterparties}
                    usersWithCashflow={usersWithCashflow}
                    prefetchedOptions={sourceRecipientOptions}
                    hideLabel
                    popperMinWidth={220}
                    sx={compactSourceRecipientSx}
                />
            </TableCell>
            <TableCell>
                <SourceRecipientSelect
                    value={sub.recipient}
                    onChange={(v) => handleChangeSubItem(parentIndex, subIndex, 'recipient', v)}
                    label={t('accountancy.recipient')}
                    counterparties={counterparties}
                    usersWithCashflow={usersWithCashflow}
                    cashflows={cashflows}
                    includeCashflows
                    prefetchedOptions={recipientRecipientOptions}
                    hideLabel
                    popperMinWidth={220}
                    sx={compactSourceRecipientSx}
                />
            </TableCell>
            <TableCell>
                <TextField
                    size="small"
                    hiddenLabel
                    placeholder={t('accountancy.cost')}
                    value={getAmountFieldDisplayValue(sub.amount, sub.amountInput)}
                    onChange={(e) => handleChangeSubItemAmount(parentIndex, subIndex, e)}
                    error={!!errors[`item_${parentIndex}_sub_${subIndex}_amount`]}
                    slotProps={{
                        htmlInput: { inputMode: 'decimal', 'aria-label': t('accountancy.cost') },
                    }}
                    sx={compactCellTextFieldSx}
                />
            </TableCell>
            <TableCell>
                <TextField
                    size="small"
                    hiddenLabel
                    type="number"
                    placeholder={t('accountancy.quantity')}
                    value={sub.quantity ?? 1}
                    onChange={(e) => handleChangeSubItemQuantity(parentIndex, subIndex, e)}
                    error={!!errors[`item_${parentIndex}_sub_${subIndex}_quantity`]}
                    slotProps={{
                        htmlInput: { min: 1, step: 1, 'aria-label': t('accountancy.quantity') },
                    }}
                    sx={compactCellTextFieldSx}
                />
            </TableCell>
            <TableCell>
                <Typography variant="caption" sx={{ fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                    {formatCompactLineTotal(sub.quantity, getEffectiveCostSub(sub))}
                </Typography>
            </TableCell>
            <TableCell>
                <TextField
                    size="small"
                    hiddenLabel
                    type="date"
                    value={sub.date || ''}
                    onChange={(e) => handleChangeSubItem(parentIndex, subIndex, 'date', e.target.value)}
                    error={!!errors[`item_${parentIndex}_sub_${subIndex}_date`]}
                    slotProps={{ htmlInput: { 'aria-label': t('accountancy.dateColumn') } }}
                    sx={compactCellTextFieldSx}
                />
            </TableCell>
            <TableCell>
                <TextField
                    size="small"
                    hiddenLabel
                    placeholder={t('accountancy.comment')}
                    value={sub.comment || ''}
                    onChange={(e) => handleChangeSubItem(parentIndex, subIndex, 'comment', e.target.value)}
                    slotProps={{ htmlInput: { 'aria-label': t('accountancy.comment') } }}
                    sx={compactCellTextFieldSx}
                />
            </TableCell>
            {type === 'expense' && (
                <TableCell>
                    <FormControl
                        size="small"
                        fullWidth
                        error={!!errors[`item_${parentIndex}_sub_${subIndex}_status`]}
                    >
                        <Select
                            value={sub.status || 'draft'}
                            sx={compactInlineSelectSx}
                            onChange={(e) =>
                                handleChangeSubItem(
                                    parentIndex,
                                    subIndex,
                                    'status',
                                    e.target.value as ExpenseStatus,
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
            )}
            {!isSubtransactionMode && type === 'income' && (
                <TableCell>
                    <FormControl
                        size="small"
                        fullWidth
                        error={!!errors[`item_${parentIndex}_sub_${subIndex}_status`]}
                    >
                        <Select
                            value={sub.status || 'draft'}
                            sx={compactInlineSelectSx}
                            onChange={(e) =>
                                handleChangeSubItem(
                                    parentIndex,
                                    subIndex,
                                    'status',
                                    e.target.value as ExpenseStatus,
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
            )}
            {isSubtransactionMode && type === 'income' && (
                <TableCell>
                    <FormControl
                        size="small"
                        fullWidth
                        error={!!errors[`item_${parentIndex}_sub_${subIndex}_status`]}
                    >
                        <Select
                            value={sub.status || 'draft'}
                            sx={compactInlineSelectSx}
                            onChange={(e) =>
                                handleChangeSubItem(
                                    parentIndex,
                                    subIndex,
                                    'status',
                                    e.target.value as ExpenseStatus,
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
            )}
            {type === 'expense' && !isSubtransactionMode && (
                <>
                    <TableCell />
                    <TableCell />
                </>
            )}
            <TableCell align="center">
                <FileAttachments
                    value={sub.attachments ?? []}
                    onChange={(attachments: AccountancyAttachment[]) =>
                        handleChangeSubItem(parentIndex, subIndex, 'attachments', attachments)
                    }
                    disabled={loading}
                    compact
                />
            </TableCell>
        </TableRow>
    );

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t(titleKey)}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <>
            <form noValidate autoComplete="off">
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Button variant="text" size="small" startIcon={<ArrowBackIcon fontSize="small" />} onClick={() => router.back()} sx={{ minWidth: 0, px: 1 }}>
                        {t('common.back')}
                    </Button>
                    <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
                        {t(titleKey)}
                    </Typography>
                </Stack>

                <Paper variant="outlined" sx={{ px: 1, py: 0.75, mb: 1 }}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="flex-start">
                        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontWeight: 600, alignSelf: 'center' }}>
                            {t('accountancy.commonForAllItems')}:
                        </Typography>
                        <Box sx={{ minWidth: 160, maxWidth: 220, flex: 1 }}>
                            <RoomsMultiSelect
                                value={selectedObjects}
                                onChange={handleChangeObject}
                                label={t('accountancy.object')}
                                multiple={false}
                                hideLabel
                                sx={compactRoomSelectSx}
                            />
                            {errors.objectId && (
                                <Typography variant="caption" color="error" sx={{ fontSize: '0.6rem' }}>
                                    {errors.objectId}
                                </Typography>
                            )}
                        </Box>
                        <FormControl size="small" sx={{ minWidth: 140, maxWidth: 160 }}>
                            <InputLabel>{t('accountancy.reportMonth')}</InputLabel>
                            <Select
                                value={sharedReportMonth}
                                label={t('accountancy.reportMonth')}
                                onChange={(e) => applySharedReportMonth(e.target.value as string)}
                            >
                                <MenuItem value="">—</MenuItem>
                                {reportMonthOptions.map((o) => (
                                    <MenuItem key={o.value} value={o.value}>
                                        {o.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {!isSubtransactionMode && (
                            <Button variant="outlined" size="small" startIcon={<AddIcon fontSize="small" />} onClick={handleAddItem}>
                                {t('accountancy.addItem')}
                            </Button>
                        )}
                    </Stack>
                    {isSubtransactionMode && (
                        <TextField
                            size="small"
                            label={t('accountancy.parentTransaction')}
                            value={parentTransaction?.label ?? t('common.loading')}
                            InputProps={{ readOnly: true }}
                            sx={{ mt: 1, width: '100%', maxWidth: 480 }}
                        />
                    )}
                </Paper>

                <TableContainer component={Paper} variant="outlined" sx={{ mb: 1, overflowX: 'auto' }}>
                    <Table size="small" stickyHeader sx={{ ...compactTableSx, minWidth: TXN_ADD_TABLE_MIN_WIDTH_PX }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ width: COMPACT_COL_DEL, maxWidth: COMPACT_COL_DEL }} />
                                <TableCell sx={{ width: COMPACT_COL_BOOKING, maxWidth: COMPACT_COL_BOOKING }}>{t('accountancy.bookingColumn')}</TableCell>
                                <TableCell sx={{ width: COMPACT_COL_CAT, maxWidth: COMPACT_COL_CAT }}>{t('accountancy.category')}</TableCell>
                                <TableCell sx={{ width: COMPACT_COL_PARTY, maxWidth: COMPACT_COL_PARTY }}>{t('accountancy.source')}</TableCell>
                                <TableCell sx={{ width: COMPACT_COL_PARTY, maxWidth: COMPACT_COL_PARTY }}>{t('accountancy.recipient')}</TableCell>
                                <TableCell sx={{ width: COMPACT_COL_AMOUNT, maxWidth: COMPACT_COL_AMOUNT }}>{t('accountancy.cost')}</TableCell>
                                <TableCell sx={{ width: COMPACT_COL_QTY, maxWidth: COMPACT_COL_QTY }}>{t('accountancy.quantity')}</TableCell>
                                <TableCell sx={{ width: COMPACT_COL_SUM, maxWidth: COMPACT_COL_SUM }}>{t('accountancy.amountColumn')}</TableCell>
                                <TableCell sx={{ width: COMPACT_COL_DATE, maxWidth: COMPACT_COL_DATE }}>{t(dateLabelKey)}</TableCell>
                                <TableCell sx={{ width: COMPACT_COL_COMMENT, maxWidth: COMPACT_COL_COMMENT }}>{t('accountancy.comment')}</TableCell>
                                {(type === 'expense' || isSubtransactionMode) && (
                                    <TableCell sx={{ width: COMPACT_COL_STATUS, maxWidth: COMPACT_COL_STATUS }}>{t('accountancy.status')}</TableCell>
                                )}
                                {(type === 'expense' || type === 'income') && !isSubtransactionMode && (
                                    <TableCell align="center" sx={{ width: COMPACT_COL_SUB_TX, maxWidth: COMPACT_COL_SUB_TX }}>
                                        {t('accountancy.subtransactionColumn')}
                                    </TableCell>
                                )}
                                {type === 'expense' && !isSubtransactionMode && (
                                    <TableCell align="center" sx={{ width: COMPACT_COL_DIVISIBILITY, maxWidth: COMPACT_COL_DIVISIBILITY }}>
                                        {t('accountancy.divisibility')}
                                    </TableCell>
                                )}
                                <TableCell sx={{ width: COMPACT_COL_ATTACH, maxWidth: COMPACT_COL_ATTACH }} />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map((item, index) => (
                                <Fragment key={index}>
                                    <TableRow hover sx={item.splittable && !isSubtransactionMode ? compactGroupParentRowSx : undefined}>
                                        <TableCell>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleRemoveItem(index)}
                                                disabled={items.length <= 1}
                                                aria-label={t('accountancy.removeItem')}
                                            >
                                                <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                                            </IconButton>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.25} alignItems="flex-start">
                                                <Tooltip title={t('accountancy.selectBooking')}>
                                                    <span>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleOpenBookingModal(index)}
                                                            disabled={!objectId}
                                                            aria-label={t('accountancy.selectBooking')}
                                                        >
                                                            <EventNoteIcon sx={{ fontSize: '1rem' }} />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                {item.bookingId != null ? (
                                                    <>
                                                        <Typography variant="caption" sx={compactBookingLabelSx}>
                                                            {bookingLabels[item.bookingId] ?? `#${item.bookingId}`}
                                                        </Typography>
                                                        <IconButton size="small" onClick={() => handleDetachBooking(index)} aria-label={t('accountancy.detachBooking')}>
                                                            <CloseIcon sx={{ fontSize: '0.85rem' }} />
                                                        </IconButton>
                                                    </>
                                                ) : usedBookingIds.length > 0 ? (
                                                    <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
                                                        <Select
                                                            value=""
                                                            displayEmpty
                                                            sx={compactInlineSelectSx}
                                                            onChange={(e) => {
                                                                const v = e.target.value;
                                                                const num = typeof v === 'number' ? v : String(v).trim() === '' ? undefined : Number(v);
                                                                if (num != null) handleChangeItem(index, 'bookingId', num);
                                                            }}
                                                        >
                                                            <MenuItem value="" disabled sx={{ fontSize: '0.6875rem' }}>—</MenuItem>
                                                            {usedBookingIds.map((id) => (
                                                                <MenuItem key={id} value={id} sx={{ fontSize: '0.6875rem' }}>{bookingLabels[id] ?? `#${id}`}</MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                ) : null}
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <FormControl size="small" fullWidth error={!!errors[`item_${index}_category`]}>
                                                <Select
                                                    value={item.category || ''}
                                                    displayEmpty
                                                    sx={compactInlineSelectSx}
                                                    onChange={(e) => handleChangeItem(index, 'category', e.target.value as string)}
                                                    MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}
                                                >
                                                    <MenuItem value="" sx={{ fontSize: '0.6875rem' }}>—</MenuItem>
                                                    {buildCategoriesForSelect(categories, type, { language }).map((cat) => (
                                                        <MenuItem key={cat.id} value={cat.name} sx={{ fontSize: '0.6875rem' }}>
                                                            {cat.depth > 0 ? '\u00A0'.repeat(cat.depth * 2) + '↳ ' : ''}{cat.label}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </TableCell>
                                        <TableCell>
                                            <SourceRecipientSelect
                                                value={item.source}
                                                onChange={(v) => handleChangeItem(index, 'source', v)}
                                                label={t('accountancy.source')}
                                                counterparties={counterparties}
                                                usersWithCashflow={usersWithCashflow}
                                                prefetchedOptions={sourceRecipientOptions}
                                                hideLabel
                                                popperMinWidth={220}
                                                sx={compactSourceRecipientSx}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <SourceRecipientSelect
                                                value={item.recipient}
                                                onChange={(v) => handleChangeItem(index, 'recipient', v)}
                                                label={t('accountancy.recipient')}
                                                counterparties={counterparties}
                                                usersWithCashflow={usersWithCashflow}
                                                cashflows={cashflows}
                                                includeCashflows
                                                prefetchedOptions={recipientRecipientOptions}
                                                hideLabel
                                                popperMinWidth={220}
                                                sx={compactSourceRecipientSx}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                size="small"
                                                hiddenLabel
                                                placeholder={t('accountancy.cost')}
                                                value={getAmountFieldDisplayValue(item.amount, item.amountInput)}
                                                onChange={(e) => handleChangeItemAmount(index, e)}
                                                error={!!errors[`item_${index}_amount`]}
                                                slotProps={{
                                                    htmlInput: { inputMode: 'decimal', 'aria-label': t('accountancy.cost') },
                                                }}
                                                sx={compactCellTextFieldSx}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                size="small"
                                                hiddenLabel
                                                type="number"
                                                placeholder={t('accountancy.quantity')}
                                                value={item.quantity ?? 1}
                                                onChange={(e) => handleChangeItemQuantity(index, e)}
                                                error={!!errors[`item_${index}_quantity`]}
                                                slotProps={{ htmlInput: { min: 1, step: 1, 'aria-label': t('accountancy.quantity') } }}
                                                sx={compactCellTextFieldSx}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" sx={{ fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                                                {formatCompactLineTotal(item.quantity, getEffectiveCostMain(item))}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                size="small"
                                                hiddenLabel
                                                type="date"
                                                value={item.date || ''}
                                                onChange={(e) => handleChangeItem(index, 'date', e.target.value)}
                                                error={!!errors[`item_${index}_date`]}
                                                slotProps={{ htmlInput: { 'aria-label': t(dateLabelKey) } }}
                                                sx={compactCellTextFieldSx}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                size="small"
                                                hiddenLabel
                                                placeholder={t('accountancy.comment')}
                                                value={item.comment || ''}
                                                onChange={(e) => handleChangeItem(index, 'comment', e.target.value)}
                                                slotProps={{ htmlInput: { 'aria-label': t('accountancy.comment') } }}
                                                sx={compactCellTextFieldSx}
                                            />
                                        </TableCell>
                                        {(type === 'expense' || isSubtransactionMode) && (
                                            <TableCell>
                                                {type === 'expense' ? (
                                                    <FormControl size="small" fullWidth error={!!errors[`item_${index}_status`]}>
                                                        <Select
                                                            value={item.status || 'draft'}
                                                            sx={compactInlineSelectSx}
                                                            onChange={(e) => handleChangeItem(index, 'status', e.target.value as ExpenseStatus)}
                                                        >
                                                            <MenuItem value="draft" sx={{ fontSize: '0.6875rem' }}>{t('accountancy.statusDraft')}</MenuItem>
                                                            <MenuItem value="confirmed" sx={{ fontSize: '0.6875rem' }}>{t('accountancy.statusConfirmed')}</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                ) : null}
                                            </TableCell>
                                        )}
                                        {(type === 'expense' || type === 'income') && !isSubtransactionMode && (
                                            <TableCell align="center">
                                                <Checkbox
                                                    checked={item.splittable}
                                                    onChange={(e) => handleChangeSplittable(index, e.target.checked)}
                                                    size="small"
                                                    inputProps={{ 'aria-label': t('accountancy.subtransactionColumn') }}
                                                />
                                            </TableCell>
                                        )}
                                        {type === 'expense' && !isSubtransactionMode && (
                                            <TableCell align="center">
                                                <Checkbox
                                                    checked={item.includeInSynthetic}
                                                    onChange={(e) => handleChangeIncludeInSynthetic(index, e.target.checked)}
                                                    size="small"
                                                    inputProps={{ 'aria-label': t('accountancy.divisibility') }}
                                                />
                                            </TableCell>
                                        )}
                                        <TableCell align="center">
                                            <FileAttachments
                                                value={item.attachments ?? []}
                                                onChange={(attachments: AccountancyAttachment[]) => handleChangeItem(index, 'attachments', attachments)}
                                                disabled={loading}
                                                compact
                                            />
                                        </TableCell>
                                    </TableRow>
                                    {(type === 'expense' || type === 'income') && !isSubtransactionMode && item.splittable && (
                                        <>
                                            <TableRow sx={compactGroupSubHeaderRowSx(item.subItems.length === 0)}>
                                                <TableCell colSpan={tableColCount} sx={{ py: 0.25 }}>
                                                    <Stack direction="row" alignItems="center" spacing={1}>
                                                        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.65rem', color: 'primary.main', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            {t('accountancy.subtransactions')}
                                                        </Typography>
                                                        {errors[`item_${index}_sub`] && (
                                                            <Typography variant="caption" color="error" sx={{ fontSize: '0.6rem' }}>{errors[`item_${index}_sub`]}</Typography>
                                                        )}
                                                        <Button variant="text" size="small" startIcon={<AddIcon sx={{ fontSize: '0.9rem !important' }} />} onClick={() => handleAddSubItem(index)} sx={{ minWidth: 0, py: 0, fontSize: '0.65rem' }}>
                                                            {t('accountancy.addSubtransaction')}
                                                        </Button>
                                                    </Stack>
                                                </TableCell>
                                            </TableRow>
                                            {item.subItems.map((sub, sIdx) =>
                                                renderSubTransactionRow(sub, index, sIdx, sIdx === item.subItems.length - 1),
                                            )}
                                        </>
                                    )}
                                    {index < items.length - 1 && (
                                        <TableRow aria-hidden>
                                            <TableCell colSpan={tableColCount} sx={{ height: 10, p: 0, border: 'none !important', bgcolor: 'background.default' }} />
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
                    <Button
                        variant="contained"
                        size="small"
                        endIcon={<SendIcon fontSize="small" />}
                        onClick={handleSubmit}
                        disabled={loading || (isSubtransactionMode && !parentTransaction)}
                    >
                        {t('common.send')}
                    </Button>
                </Stack>
            </form>

            <BookingSelectModal
                open={bookingModalTarget !== null}
                onClose={handleCloseBookingModal}
                onSelect={handleBookingSelect}
                initialObjectId={objectId}
                reportMonth={sharedReportMonth}
                initialRoomId={bookingModalInitialRoomId}
            />
            {DuplicateDialog}
        </>
    );
}

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
    TableHead,
    TableRow,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { AccountancyCategory, AccountancyAttachment, Booking, Expense, Income, ExpenseStatus, UserObject } from '@/lib/types';
import { formatTitle } from '@/lib/format';
import { addExpense } from '@/lib/expenses';
import { addIncome } from '@/lib/incomes';
import { getApiErrorMessage } from '@/lib/axiosResponseMessage';
import { formatPartialTransactionAddWarning } from '@/lib/accountancyPartialAddMessage';
import { getCounterparties } from '@/lib/counterparties';
import { getCashflows } from '@/lib/cashflows';
import { getUsersWithCashflow } from '@/lib/users';
import FileAttachments from '@/components/accountancy/FileAttachments';
import SourceRecipientSelect, {
    type SourceRecipientOptionValue,
    PREFIX_ROOM,
} from '@/components/accountancy/SourceRecipientSelect';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useRouter } from 'next/navigation';
import RoomsMultiSelect from '@/components/objectsMultiSelect/RoomsMultiSelect';
import BookingSelectModal from '@/components/bookingsModal/BookingSelectModal';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';

type LineFields = {
    category: string;
    amount: number | undefined;
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
    subItems: SubItemForm[];
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

function createDefaultItem(): ItemForm {
    return {
        ...createDefaultLineFields(),
        splittable: false,
        subItems: [],
    };
}

/** YYYY-MM → первый день месяца YYYY-MM-DD (для input type="date") */
function reportMonthToFirstDayString(reportMonth: string): string {
    if (!/^\d{4}-\d{2}$/.test(reportMonth)) return '';
    return `${reportMonth}-01`;
}

interface TransactionAddFormProps {
    type: 'expense' | 'income';
}

export default function TransactionAddForm({ type }: TransactionAddFormProps) {
    const { t } = useTranslation();
    const router = useRouter();
    const { isAdmin, isAccountant, user } = useUser();
    const [selectedObjects, setSelectedObjects] = useState<UserObject[]>([]);
    const [objectId, setObjectId] = useState<number | undefined>();
    const [roomId, setRoomId] = useState<number | undefined>();
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
    /** Кэшфлоу текущего пользователя (как на /dashboard/cashflow), без query в URL */
    const [userCashflowId, setUserCashflowId] = useState<string | undefined>();
    /** Месяц отчёта YYYY-MM, общий для всех позиций (расходы и приходы) */
    const [sharedReportMonth, setSharedReportMonth] = useState('');

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
                const uid = user?._id?.toString?.() ?? (user as { _id?: string })?._id;
                const userCf = uid ? cfs.find((cf) => cf.userId === uid) : undefined;
                setUserCashflowId(userCf?._id);

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
    }, [hasAccess, type, user?._id]);

    const handleChangeObject = (value: UserObject[]) => {
        setSelectedObjects(value);
        const objId = value.length > 0 ? value[0].id : undefined;
        const rId = value.length > 0 && value[0].rooms.length > 0 ? value[0].rooms[0] : undefined;
        setObjectId(objId);
        setRoomId(rId);
        const roomValue: SourceRecipientOptionValue | '' =
            objId != null && rId != null ? `${PREFIX_ROOM}${objId}:${rId}` : '';
        setItems((prev) =>
            prev.map((item) => ({
                ...item,
                source: type === 'expense' ? roomValue : item.source,
                recipient: type === 'income' ? roomValue : item.recipient,
                subItems: item.subItems.map((sub) => ({
                    ...sub,
                    source: type === 'expense' ? roomValue : sub.source,
                    recipient: type === 'income' ? roomValue : sub.recipient,
                })),
            }))
        );
        setErrors((prev) => {
            const next = { ...prev };
            if (objId) delete next.objectId;
            return next;
        });
    };

    const handleAddItem = () => {
        const newItem = createDefaultItem();
        if (objectId != null && roomId != null) {
            if (type === 'expense') newItem.source = `${PREFIX_ROOM}${objectId}:${roomId}`;
            else newItem.recipient = `${PREFIX_ROOM}${objectId}:${roomId}`;
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
        setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
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
        const num = Number(event.target.value);
        handleChangeItem(index, 'amount', isNaN(num) ? undefined : num);
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
        if (item.amount != null) return item.amount;
        const cat = categories.find((c) => c.name === item.category);
        return cat?.pricePerUnit ?? 0;
    };

    const getEffectiveCostSub = (sub: SubItemForm): number => {
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
                    const sub = createDefaultSubItem(type);
                    if (objectId != null && roomId != null) {
                        if (type === 'expense') {
                            sub.source = `${PREFIX_ROOM}${objectId}:${roomId}`;
                        } else {
                            sub.recipient = `${PREFIX_ROOM}${objectId}:${roomId}`;
                        }
                    }
                    if (sharedReportMonth) {
                        sub.date = reportMonthToFirstDayString(sharedReportMonth);
                    }
                    subItems = [sub];
                }
                return { ...item, splittable: true, subItems };
            })
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
                    if (field === 'recordKind') {
                        return { ...next, category: '' };
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
        const num = Number(event.target.value);
        handleChangeSubItem(parentIndex, subIndex, 'amount', isNaN(num) ? undefined : num);
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
        const newSub = createDefaultSubItem(type);
        if (objectId != null && roomId != null) {
            if (type === 'expense') {
                newSub.source = `${PREFIX_ROOM}${objectId}:${roomId}`;
            } else {
                newSub.recipient = `${PREFIX_ROOM}${objectId}:${roomId}`;
            }
        }
        if (sharedReportMonth) {
            newSub.date = reportMonthToFirstDayString(sharedReportMonth);
        }
        setItems((prev) =>
            prev.map((item, i) =>
                i === parentIndex ? { ...item, subItems: [...item.subItems, newSub] } : item
            )
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
            if (eff < 0) errs[`${keyPrefix}_amount`] = t('accountancy.cost');
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
        if (!validate() || !objectId) return;

        setLoading(true);
        let successCount = 0;
        const failures: { category: string; message: string }[] = [];

        try {
            for (const item of items) {
                const effectiveCost = getEffectiveCostMain(item);
                try {
                    let res;
                    if (type === 'expense') {
                        const basePayload: Omit<Expense, 'parentExpenseId' | 'parentIncomeId'> = {
                            objectId,
                            roomId,
                            bookingId: item.bookingId,
                            source: item.source || undefined,
                            recipient: item.recipient || undefined,
                            cashflowId: userCashflowId,
                            category: item.category,
                            amount: effectiveCost,
                            quantity: item.quantity ?? 1,
                            date: new Date(item.date),
                            comment: item.comment || '',
                            status: item.status,
                            reportMonth: sharedReportMonth || undefined,
                            attachments: item.attachments ?? [],
                            accountantId: '',
                        };
                        if (item.splittable) {
                            const parentRes = await addExpense(basePayload);
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
                                            roomId,
                                            bookingId: sub.bookingId,
                                            source: sub.source || undefined,
                                            recipient: sub.recipient || undefined,
                                            cashflowId: userCashflowId,
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
                                            quantity: sub.quantity ?? 1,
                                            date: new Date(sub.date),
                                            status: sub.status,
                                            reportMonth: sharedReportMonth || undefined,
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
                        res = await addExpense(basePayload);
                    } else {
                        const baseIncomePayload: Omit<Income, 'parentExpenseId' | 'parentIncomeId'> = {
                            objectId,
                            roomId,
                            bookingId: item.bookingId,
                            cashflowId: userCashflowId,
                            category: item.category,
                            amount: effectiveCost,
                            quantity: item.quantity ?? 1,
                            date: new Date(item.date),
                            status: 'draft',
                            reportMonth: sharedReportMonth || undefined,
                            source: item.source || undefined,
                            recipient: item.recipient || undefined,
                            comment: item.comment || undefined,
                            attachments: item.attachments ?? [],
                            accountantId: '',
                        };
                        if (item.splittable) {
                            const parentRes = await addIncome(baseIncomePayload);
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
                                            roomId,
                                            bookingId: sub.bookingId,
                                            source: sub.source || undefined,
                                            recipient: sub.recipient || undefined,
                                            cashflowId: userCashflowId,
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
                                            quantity: sub.quantity ?? 1,
                                            date: new Date(sub.date),
                                            status: sub.status,
                                            reportMonth: sharedReportMonth || undefined,
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
                        res = await addIncome(baseIncomePayload);
                    }
                    if (res.success) successCount++;
                    else failures.push({ category: item.category, message: res.message || t('common.serverError') });
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

    const titleKey = type === 'expense' ? 'accountancy.addExpense' : 'accountancy.addIncome';
    const dateLabelKey = type === 'expense' ? 'accountancy.expenseDate' : 'accountancy.incomeDate';

    const mainRowColSpan = type === 'expense' ? 13 : 12;

    const renderSubTransactionRow = (sub: SubItemForm, parentIndex: number, subIndex: number) => (
        <TableRow key={`${parentIndex}-sub-${subIndex}`}>
            <TableCell>
                <IconButton
                    size="small"
                    onClick={() => handleRemoveSubItem(parentIndex, subIndex)}
                    disabled={items[parentIndex]?.subItems.length <= 1}
                    aria-label={t('accountancy.removeItem')}
                >
                    <DeleteOutlineIcon fontSize="small" />
                </IconButton>
            </TableCell>
            <TableCell sx={{ minWidth: 120 }}>
                <FormControl size="small" sx={{ minWidth: 110 }}>
                    <InputLabel>{t('accountancy.recordKindColumn')}</InputLabel>
                    <Select
                        value={sub.recordKind}
                        label={t('accountancy.recordKindColumn')}
                        onChange={(e) =>
                            handleChangeSubItem(
                                parentIndex,
                                subIndex,
                                'recordKind',
                                e.target.value as 'expense' | 'income'
                            )
                        }
                    >
                        <MenuItem value="expense">{t('accountancy.expense')}</MenuItem>
                        <MenuItem value="income">{t('accountancy.income')}</MenuItem>
                    </Select>
                </FormControl>
            </TableCell>
            <TableCell sx={{ minWidth: 200 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>{t('accountancy.bookingQuickSelect')}</InputLabel>
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
                                handleChangeSubItem(parentIndex, subIndex, 'bookingId', num);
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
                        onClick={() => handleOpenSubBookingModal(parentIndex, subIndex)}
                    >
                        {t('accountancy.selectBooking')}
                    </Button>
                    {sub.bookingId != null && (
                        <IconButton
                            size="small"
                            color="secondary"
                            onClick={() => handleDetachSubBooking(parentIndex, subIndex)}
                            title={t('accountancy.detachBooking')}
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
                    sx={{ minWidth: 160 }}
                    error={!!errors[`item_${parentIndex}_sub_${subIndex}_category`]}
                >
                    <InputLabel>{t('accountancy.category')}</InputLabel>
                    <Select
                        value={sub.category || ''}
                        label={t('accountancy.category')}
                        onChange={(e) =>
                            handleChangeSubItem(parentIndex, subIndex, 'category', e.target.value as string)
                        }
                    >
                        {buildCategoriesForSelect(
                            sub.recordKind === 'income'
                                ? type === 'expense'
                                    ? subIncomeCategories
                                    : categories
                                : type === 'expense'
                                  ? categories
                                  : subExpenseCategories,
                            sub.recordKind
                        ).map((cat) => (
                            <MenuItem key={cat.id} value={cat.name}>
                                {cat.depth > 0 ? '\u00A0'.repeat(cat.depth * 2) + '↳ ' : ''}
                                {cat.name}
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
                    sx={{ minWidth: 200 }}
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
                    sx={{ minWidth: 200 }}
                />
            </TableCell>
            <TableCell>
                <TextField
                    size="small"
                    type="number"
                    label={t('accountancy.cost')}
                    value={sub.amount ?? ''}
                    onChange={(e) => handleChangeSubItemAmount(parentIndex, subIndex, e)}
                    error={!!errors[`item_${parentIndex}_sub_${subIndex}_amount`]}
                    inputProps={{ min: 0, step: 0.01 }}
                    sx={{ width: 120 }}
                />
            </TableCell>
            <TableCell>
                <TextField
                    size="small"
                    type="number"
                    label={t('accountancy.quantity')}
                    value={sub.quantity ?? 1}
                    onChange={(e) => handleChangeSubItemQuantity(parentIndex, subIndex, e)}
                    error={!!errors[`item_${parentIndex}_sub_${subIndex}_quantity`]}
                    inputProps={{ min: 1, step: 1 }}
                    sx={{ width: 90 }}
                />
            </TableCell>
            <TableCell>
                <Typography variant="body2">
                    {t('accountancy.amountColumn')}:{' '}
                    {((sub.quantity ?? 1) * getEffectiveCostSub(sub)).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}
                </Typography>
            </TableCell>
            <TableCell>
                <TextField
                    size="small"
                    type="date"
                    InputLabelProps={{ shrink: true }}
                    value={sub.date || ''}
                    onChange={(e) =>
                        handleChangeSubItem(parentIndex, subIndex, 'date', e.target.value)
                    }
                    error={!!errors[`item_${parentIndex}_sub_${subIndex}_date`]}
                    sx={{ width: 150 }}
                />
            </TableCell>
            <TableCell>
                <TextField
                    size="small"
                    placeholder={t('accountancy.comment')}
                    value={sub.comment || ''}
                    onChange={(e) =>
                        handleChangeSubItem(parentIndex, subIndex, 'comment', e.target.value)
                    }
                    sx={{ minWidth: 120 }}
                />
            </TableCell>
            <TableCell>
                <FormControl
                    size="small"
                    sx={{ minWidth: 120 }}
                    error={!!errors[`item_${parentIndex}_sub_${subIndex}_status`]}
                >
                    <InputLabel>{t('accountancy.status')}</InputLabel>
                    <Select
                        value={sub.status || 'draft'}
                        label={t('accountancy.status')}
                        onChange={(e) =>
                            handleChangeSubItem(
                                parentIndex,
                                subIndex,
                                'status',
                                e.target.value as ExpenseStatus
                            )
                        }
                    >
                        <MenuItem value="draft">{t('accountancy.statusDraft')}</MenuItem>
                        <MenuItem value="confirmed">{t('accountancy.statusConfirmed')}</MenuItem>
                    </Select>
                </FormControl>
            </TableCell>
            <TableCell>
                <FileAttachments
                    value={sub.attachments ?? []}
                    onChange={(attachments: AccountancyAttachment[]) =>
                        handleChangeSubItem(parentIndex, subIndex, 'attachments', attachments)
                    }
                    disabled={loading}
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
                <Typography variant="h4">{t(titleKey)}</Typography>

                <Paper variant="outlined" sx={{ p: 2, mt: 2, mb: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('accountancy.commonForAllItems')}
                    </Typography>
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={2}
                        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                        sx={{ maxWidth: { xs: '500px', sm: '720px' } }}
                    >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
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
                        <FormControl size="small" sx={{ minWidth: 200, maxWidth: '100%' }}>
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
                    </Stack>
                </Paper>

                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    {t('accountancy.itemsToAdd')}
                </Typography>
                <Box sx={{ overflowX: 'auto', mb: 2 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell width={40} />
                                <TableCell>{t('accountancy.bookingColumn')}</TableCell>
                                <TableCell>{t('accountancy.category')}</TableCell>
                                <TableCell>{t('accountancy.source')}</TableCell>
                                <TableCell>{t('accountancy.recipient')}</TableCell>
                                <TableCell>{t('accountancy.cost')}</TableCell>
                                <TableCell>{t('accountancy.quantity')}</TableCell>
                                <TableCell>{t('accountancy.amountColumn')}</TableCell>
                                <TableCell>{t(dateLabelKey)}</TableCell>
                                <TableCell>{t('accountancy.comment')}</TableCell>
                                {type === 'expense' && <TableCell>{t('accountancy.status')}</TableCell>}
                                {(type === 'expense' || type === 'income') && (
                                    <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                                        {t('accountancy.divisibility')}
                                    </TableCell>
                                )}
                                <TableCell>{t('accountancy.attachments')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map((item, index) => (
                                <Fragment key={index}>
                                    <TableRow>
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

                                    {/* Бронирование */}
                                    <TableCell sx={{ minWidth: 200 }}>
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            alignItems="center"
                                            flexWrap="wrap"
                                            useFlexGap
                                        >
                                            <FormControl size="small" sx={{ minWidth: 140 }}>
                                                <InputLabel>{t('accountancy.bookingQuickSelect')}</InputLabel>
                                                <Select
                                                    value={item.bookingId ?? ''}
                                                    label={t('accountancy.bookingQuickSelect')}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        const num =
                                                            typeof v === 'number'
                                                                ? v
                                                                : String(v).trim() === ''
                                                                  ? undefined
                                                                  : Number(v);
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

                                    {/* Категория */}
                                    <TableCell>
                                        <FormControl
                                            size="small"
                                            sx={{ minWidth: 160 }}
                                            error={!!errors[`item_${index}_category`]}
                                        >
                                            <InputLabel>{t('accountancy.category')}</InputLabel>
                                            <Select
                                                value={item.category || ''}
                                                label={t('accountancy.category')}
                                                onChange={(e) =>
                                                    handleChangeItem(index, 'category', e.target.value as string)
                                                }
                                            >
                                                {buildCategoriesForSelect(categories, type).map((cat) => (
                                                    <MenuItem key={cat.id} value={cat.name}>
                                                        {cat.depth > 0
                                                            ? '\u00A0'.repeat(cat.depth * 2) + '↳ '
                                                            : ''}
                                                        {cat.name}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </TableCell>

                                    {/* Источник */}
                                    <TableCell>
                                        <SourceRecipientSelect
                                            value={item.source}
                                            onChange={(v) => handleChangeItem(index, 'source', v)}
                                            label={t('accountancy.source')}
                                            counterparties={counterparties}
                                            usersWithCashflow={usersWithCashflow}
                                            sx={{ minWidth: 200 }}
                                        />
                                    </TableCell>

                                    {/* Получатель */}
                                    <TableCell>
                                        <SourceRecipientSelect
                                            value={item.recipient}
                                            onChange={(v) => handleChangeItem(index, 'recipient', v)}
                                            label={t('accountancy.recipient')}
                                            counterparties={counterparties}
                                            usersWithCashflow={usersWithCashflow}
                                            cashflows={cashflows}
                                            includeCashflows
                                            sx={{ minWidth: 200 }}
                                        />
                                    </TableCell>

                                    {/* Стоимость */}
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

                                    {/* Количество */}
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

                                    {/* Сумма */}
                                    <TableCell>
                                        <Typography variant="body2">
                                            {t('accountancy.amountColumn')}:{' '}
                                            {(
                                                (item.quantity ?? 1) * getEffectiveCostMain(item)
                                            ).toLocaleString('ru-RU', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}
                                        </Typography>
                                    </TableCell>

                                    {/* Дата */}
                                    <TableCell>
                                        <TextField
                                            size="small"
                                            type="date"
                                            InputLabelProps={{ shrink: true }}
                                            value={item.date || ''}
                                            onChange={(e) => handleChangeItem(index, 'date', e.target.value)}
                                            error={!!errors[`item_${index}_date`]}
                                            sx={{ width: 150 }}
                                        />
                                    </TableCell>

                                    {/* Комментарий */}
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

                                    {/* Статус — только для расходов */}
                                    {type === 'expense' && (
                                        <TableCell>
                                            <FormControl
                                                size="small"
                                                sx={{ minWidth: 120 }}
                                                error={!!errors[`item_${index}_status`]}
                                            >
                                                <InputLabel>{t('accountancy.status')}</InputLabel>
                                                <Select
                                                    value={item.status || 'draft'}
                                                    label={t('accountancy.status')}
                                                    onChange={(e) =>
                                                        handleChangeItem(
                                                            index,
                                                            'status',
                                                            e.target.value as ExpenseStatus
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
                                    )}
                                    {(type === 'expense' || type === 'income') && (
                                        <TableCell align="center" sx={{ verticalAlign: 'middle' }}>
                                            <Checkbox
                                                checked={item.splittable}
                                                onChange={(e) =>
                                                    handleChangeSplittable(index, e.target.checked)
                                                }
                                                size="small"
                                                inputProps={{
                                                    'aria-label': t('accountancy.divisibility'),
                                                }}
                                            />
                                        </TableCell>
                                    )}

                                    {/* Вложения */}
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
                                    {(type === 'expense' || type === 'income') && item.splittable && (
                                        <TableRow>
                                            <TableCell colSpan={mainRowColSpan} sx={{ py: 2, verticalAlign: 'top' }}>
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
                                                    {errors[`item_${index}_sub`] && (
                                                        <Typography
                                                            variant="caption"
                                                            color="error"
                                                            display="block"
                                                            sx={{ mb: 1 }}
                                                        >
                                                            {errors[`item_${index}_sub`]}
                                                        </Typography>
                                                    )}
                                                    <Table size="small">
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell width={40} />
                                                                <TableCell>
                                                                    {t('accountancy.recordKindColumn')}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {t('accountancy.bookingColumn')}
                                                                </TableCell>
                                                                <TableCell>{t('accountancy.category')}</TableCell>
                                                                <TableCell>{t('accountancy.source')}</TableCell>
                                                                <TableCell>{t('accountancy.recipient')}</TableCell>
                                                                <TableCell>{t('accountancy.cost')}</TableCell>
                                                                <TableCell>{t('accountancy.quantity')}</TableCell>
                                                                <TableCell>{t('accountancy.amountColumn')}</TableCell>
                                                                <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                                                <TableCell>{t('accountancy.comment')}</TableCell>
                                                                <TableCell>{t('accountancy.status')}</TableCell>
                                                                <TableCell>{t('accountancy.attachments')}</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {item.subItems.map((sub, sIdx) =>
                                                                renderSubTransactionRow(sub, index, sIdx)
                                                            )}
                                                        </TableBody>
                                                    </Table>
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        startIcon={<AddIcon />}
                                                        onClick={() => handleAddSubItem(index)}
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

                <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddItem}
                    sx={{ mb: 2 }}
                >
                    {t('accountancy.addItem')}
                </Button>

                <Stack direction="row" spacing={2} mt={2}>
                    <Button
                        variant="outlined"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => router.back()}
                    >
                        {t('common.cancel')}
                    </Button>
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
                open={bookingModalTarget !== null}
                onClose={handleCloseBookingModal}
                onSelect={handleBookingSelect}
                initialObjectId={objectId}
                reportMonth={sharedReportMonth}
                initialRoomId={roomId}
            />
        </>
    );
}

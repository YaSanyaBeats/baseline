'use client'

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Box,
    Button,
    Typography,
    Alert,
    Stack,
    Paper,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Switch,
    IconButton,
    Chip,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
} from "@mui/material";
import { Visibility, Delete as DeleteIcon } from "@mui/icons-material";
import { useUser } from "@/providers/UserProvider";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useTranslation } from "@/i18n/useTranslation";
import Link from 'next/link';
import { useObjects } from "@/providers/ObjectsProvider";
import { AccountancyCategory, Booking, Expense, Income } from "@/lib/types";
import { getExpenseSum, getIncomeSum } from "@/lib/accountancyUtils";
import { getExpenses, updateExpense, deleteExpense } from "@/lib/expenses";
import { getIncomes, updateIncome, deleteIncome } from "@/lib/incomes";
import { getBookingsByIds } from "@/lib/bookings";
import { getCounterparties } from "@/lib/counterparties";
import { getCashflows } from "@/lib/cashflows";
import { getUsersWithCashflow } from "@/lib/users";
import { getAccountancyCategories } from "@/lib/accountancyCategories";
import { buildCategoriesForSelect } from "@/lib/accountancyCategoryUtils";
import SourceRecipientSelect, {
    type SourceRecipientOptionValue,
} from "@/components/accountancy/SourceRecipientSelect";

const OVERVIEW_FILTERS_KEY = 'accountancy-overview-filters';

/** Строка сводки: расходы/доходы объекта, не привязанные ни к одной комнате (см. resolveRecordRoomId). */
const ACCOUNTANCY_UNALLOCATED_ROOM_ID = -900_000_001;

/** YYYY-MM-DD по локальному календарю — границы периода и даты операций без сдвига UTC. */
function localCalendarYmd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ширина Select «Месяц отчёта» в таблице операций */
const OP_TABLE_SELECT_WIDTH_PX = 104;
/** Колонки «От кого» / «Кому» (Autocomplete) */
const OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX = 260;
/** Ширина Select «Категория» */
const OP_TABLE_CAT_SELECT_WIDTH_PX = 260;
/** Колонка «Категория»: селект + чип «Авто» в одну строку */
const OP_TABLE_CATEGORY_COL_WIDTH_PX = OP_TABLE_CAT_SELECT_WIDTH_PX + 48;
/** Колонка «Количество»: только 1-2 цифры */
const OP_TABLE_QTY_COL_WIDTH_PX = 58;
/** Колонка «Комментарий» — только px: при table-layout:fixed + width:100% проценты ломали раскладку */
const OP_TABLE_COMMENT_COL_WIDTH_PX = 240;
/** Минимальная ширина таблицы (сумма колонок), чтобы колонки не схлопывались до нуля */
const OP_TABLE_MIN_WIDTH_PX =
    44 +
    OP_TABLE_SELECT_WIDTH_PX +
    72 +
    OP_TABLE_CATEGORY_COL_WIDTH_PX +
    OP_TABLE_COMMENT_COL_WIDTH_PX +
    OP_TABLE_QTY_COL_WIDTH_PX +
    80 +
    OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX * 2 +
    52;

const opTableSelectFormSx = {
    width: OP_TABLE_SELECT_WIDTH_PX,
    minWidth: OP_TABLE_SELECT_WIDTH_PX,
    maxWidth: OP_TABLE_SELECT_WIDTH_PX,
} as const;

const opTableCatSelectFormSx = {
    width: OP_TABLE_CAT_SELECT_WIDTH_PX,
    minWidth: OP_TABLE_CAT_SELECT_WIDTH_PX,
    maxWidth: OP_TABLE_CAT_SELECT_WIDTH_PX,
} as const;

const opTableQtySelectFormSx = {
    width: OP_TABLE_QTY_COL_WIDTH_PX,
    minWidth: OP_TABLE_QTY_COL_WIDTH_PX,
    maxWidth: OP_TABLE_QTY_COL_WIDTH_PX,
} as const;

const opTableSelectSx = {
    width: '100%',
    maxWidth: '100%',
    '& .MuiSelect-select': {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'block',
        py: '4px',
        pr: '22px',
        fontSize: '0.6875rem',
        lineHeight: 1.25,
        minHeight: 26,
        boxSizing: 'border-box',
    },
} as const;

/** Select «Категория»: только текст, без рамки и стрелки; список по клику без изменений */
const opTableInlineSelectSx = {
    width: '100%',
    maxWidth: '100%',
    bgcolor: 'transparent',
    boxShadow: 'none',
    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
    '&:hover .MuiOutlinedInput-notchedOutline': { border: 'none' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: 'none' },
    '& .MuiOutlinedInput-root.Mui-focused': { boxShadow: 'none' },
    '& .MuiSelect-icon': { display: 'none' },
    '& .MuiSelect-select': {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'block',
        py: '2px',
        px: 0,
        pr: '2px',
        fontSize: '0.6875rem',
        lineHeight: 1.25,
        minHeight: 22,
        boxSizing: 'border-box',
    },
} as const;

/** Autocomplete «От кого» / «Кому»: только текст, без рамки и индикатора */
const opTableSourceRecipientSx = {
    width: OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX,
    minWidth: OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX,
    maxWidth: OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX,
    '& .MuiOutlinedInput-root': {
        minHeight: 'auto',
        fontSize: '0.6875rem',
        py: 0,
        px: 0,
        boxSizing: 'border-box',
        bgcolor: 'transparent',
        '& fieldset': { border: 'none' },
        '&:hover fieldset': { border: 'none' },
        '&.Mui-focused fieldset': { border: 'none' },
        '&.Mui-focused': { boxShadow: 'none' },
    },
    '& .MuiOutlinedInput-input': {
        py: '2px',
        px: 0,
        fontSize: '0.6875rem',
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    '& .MuiAutocomplete-popupIndicator': { display: 'none' },
    '& .MuiAutocomplete-clearIndicator': { display: 'none' },
} as const;

function parseOverviewObjectId(v: unknown): number | 'all' {
    if (v === 'all' || v === null || v === undefined || v === '') return 'all';
    const n = Number(v);
    return Number.isFinite(n) ? n : 'all';
}

function parseOverviewRoomId(v: unknown): number | 'all' {
    if (v === 'all' || v === null || v === undefined || v === '') return 'all';
    const n = Number(v);
    return Number.isFinite(n) ? n : 'all';
}

function loadOverviewFilters() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(OVERVIEW_FILTERS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            selectedObjectId: parseOverviewObjectId(parsed.selectedObjectId),
            selectedRoomId: parseOverviewRoomId(parsed.selectedRoomId),
            dateFrom: String(parsed.dateFrom ?? ''),
            dateTo: String(parsed.dateTo ?? ''),
            selectedMonth: String(parsed.selectedMonth ?? ''),
        };
    } catch {
        return null;
    }
}

function saveOverviewFilters(state: {
    selectedObjectId: number | 'all';
    selectedRoomId: number | 'all';
    dateFrom: string;
    dateTo: string;
    selectedMonth: string;
}) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(OVERVIEW_FILTERS_KEY, JSON.stringify(state));
    } catch {
        // ignore
    }
}

/** Месяцы YYYY-MM, попадающие в интервал дат (локальные), или null — период не задан, без отбора по «Месяцу отчёта». */
function reportMonthsInDateRange(fromStr: string, toStr: string): Set<string> | null {
    if (!fromStr && !toStr) return null;
    const start = fromStr ? new Date(fromStr) : new Date(toStr);
    const end = toStr ? new Date(toStr) : new Date(fromStr);
    let y = start.getFullYear();
    let m = start.getMonth();
    const endY = end.getFullYear();
    const endM = end.getMonth();
    const set = new Set<string>();
    while (y < endY || (y === endY && m <= endM)) {
        set.add(`${y}-${String(m + 1).padStart(2, '0')}`);
        m++;
        if (m > 11) {
            m = 0;
            y++;
        }
    }
    return set;
}

/** Парсинг суммы из поля ввода (пробелы, запятая или точка как разделитель дробной части). */
function parseLocalizedTotalAmount(raw: string): number | null {
    const t = raw.trim().replace(/\s/g, '').replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}

/**
 * Попадание записи в выбранный период сводки.
 * Учитываем и календарные границы (дата операции), и поле «Месяц отчёта»:
 * иначе запись с датой в декабре, но с отчётным месяцем ноябрь, полностью выпадала из декабрьской сводки.
 */
function recordMatchesReportPeriod(
    date: Date | string | undefined,
    reportMonth: string | undefined | null,
    reportMonthsInFilter: Set<string> | null,
    isDateInRange: (d: Date | string | undefined) => boolean,
): boolean {
    if (reportMonthsInFilter === null) return isDateInRange(date);
    const rm = (reportMonth ?? '').trim();
    const byDate = isDateInRange(date);
    const byReportMonth = rm !== '' && reportMonthsInFilter.has(rm);
    return byDate || byReportMonth;
}

/** Room/unit/booking id из API/Mongo может прийти строкой — иначе `===` с числовым room.id ломает строки сводки. */
function normalizeUnitOrRoomId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * Запись относится к выбранному объекту сводки: совпадение внутреннего id или тот же Beds24 propertyId
 * (в базе могут быть два документа объекта с разным id при одном property).
 */
function recordObjectMatchesSelected(
    recordObjectId: number,
    selected: { id: number; propertyId: number },
    allObjects: { id: number; propertyId: number }[],
): boolean {
    const rid = normalizeUnitOrRoomId(recordObjectId);
    if (rid != null && rid === selected.id) return true;
    const row = allObjects.find(
        (o) => o.id === recordObjectId || normalizeUnitOrRoomId(o.id) === rid,
    );
    return row != null && row.propertyId === selected.propertyId;
}

type OperationRow = {
    id: string;
    type: 'expense' | 'income';
    entityId: string;
    status: 'draft' | 'confirmed';
    date: Date | string;
    category: string;
    comment: string;
    quantity: number;
    amount: number;
    reportMonth: string;
    source?: string;
    recipient?: string;
    autoCreated?: boolean;
};

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const { objects } = useObjects();

    // Функция для форматирования чисел с двумя знаками после запятой и разделителями разрядов
    const formatAmount = (value: number): string => {
        return value.toLocaleString('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [usersWithCashflow, setUsersWithCashflow] = useState<{ _id: string; name: string }[]>([]);
    const [cashflows, setCashflows] = useState<{ _id: string; name: string }[]>([]);
    const [categoriesExpense, setCategoriesExpense] = useState<AccountancyCategory[]>([]);
    const [categoriesIncome, setCategoriesIncome] = useState<AccountancyCategory[]>([]);
    const [loading, setLoading] = useState(true);

    const [filtersHydrated, setFiltersHydrated] = useState(false);
    const [selectedObjectId, setSelectedObjectId] = useState<number | 'all'>('all');
    const [selectedRoomId, setSelectedRoomId] = useState<number | 'all'>('all');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    // '' = кастомный период по dateFrom/dateTo; 'YYYY-MM' = выбранный месяц
    const [selectedMonth, setSelectedMonth] = useState<string>('');
    const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
    const [reportMonthUpdatingId, setReportMonthUpdatingId] = useState<string | null>(null);
    const [quantityUpdatingId, setQuantityUpdatingId] = useState<string | null>(null);
    const [amountEditingId, setAmountEditingId] = useState<string | null>(null);
    const [amountDraft, setAmountDraft] = useState('');
    const [amountUpdatingId, setAmountUpdatingId] = useState<string | null>(null);
    const amountEditEscapeRef = useRef(false);
    const [inlinePatchUpdatingId, setInlinePatchUpdatingId] = useState<string | null>(null);
    const [commentDraftByRowId, setCommentDraftByRowId] = useState<Record<string, string>>({});
    const [operationToDelete, setOperationToDelete] = useState<OperationRow | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [operationDeletingId, setOperationDeletingId] = useState<string | null>(null);

    useEffect(() => {
        const s = loadOverviewFilters();
        if (s) {
            setSelectedObjectId(s.selectedObjectId);
            setSelectedRoomId(s.selectedRoomId);
            setDateFrom(s.dateFrom);
            setDateTo(s.dateTo);
            setSelectedMonth(s.selectedMonth);
        }
        setFiltersHydrated(true);
    }, []);

    useEffect(() => {
        if (!filtersHydrated) return;
        saveOverviewFilters({
            selectedObjectId,
            selectedRoomId,
            dateFrom,
            dateTo,
            selectedMonth,
        });
    }, [filtersHydrated, selectedObjectId, selectedRoomId, dateFrom, dateTo, selectedMonth]);

    const { hasAccess } = useMemo(() => {
        const hasAccess = isAdmin || isAccountant;
        return { hasAccess };
    }, [isAdmin, isAccountant]);

    useEffect(() => {
        if (!hasAccess) return;

        const load = async () => {
            try {
                const [exp, inc, cps, cfs, usersCf, catExp, catInc] = await Promise.all([
                    getExpenses(),
                    getIncomes(),
                    getCounterparties(),
                    getCashflows(),
                    getUsersWithCashflow(),
                    getAccountancyCategories('expense'),
                    getAccountancyCategories('income'),
                ]);
                setCategoriesExpense(catExp);
                setCategoriesIncome(catInc);
                setCounterparties(cps.map((c) => ({ _id: c._id!, name: c.name })));
                setCashflows(cfs.map((c) => ({ _id: c._id!, name: c.name })));
                setUsersWithCashflow(usersCf);
                setExpenses(exp);
                setIncomes(inc);

                const bookingIds = Array.from(
                    new Set(
                        [
                            ...exp.map((e) => e.bookingId).filter((id): id is number => typeof id === 'number'),
                            ...inc.map((i) => i.bookingId).filter((id): id is number => typeof id === 'number'),
                        ],
                    ),
                );

                if (bookingIds.length) {
                    const bookingsList = await getBookingsByIds(bookingIds);
                    setBookings(bookingsList);
                } else {
                    setBookings([]);
                }
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [hasAccess]);

    

    const totalExpenses = expenses.reduce((sum, e) => sum + getExpenseSum(e), 0);
    const totalIncomes = incomes.reduce((sum, i) => sum + getIncomeSum(i), 0);
    const balance = totalIncomes - totalExpenses;

    // Эффективный период: либо выбранный месяц, либо кастомные dateFrom/dateTo
    const effectiveDateRange = useMemo(() => {
        if (selectedMonth) {
            const [y, m] = selectedMonth.split('-').map(Number);
            const from = new Date(y, m - 1, 1);
            const to = new Date(y, m, 0);
            return { from: localCalendarYmd(from), to: localCalendarYmd(to) };
        }
        return { from: dateFrom, to: dateTo };
    }, [selectedMonth, dateFrom, dateTo]);

    const isDateInRange = useMemo(() => {
        const { from: effFrom, to: effTo } = effectiveDateRange;
        if (!effFrom && !effTo) return () => true;
        return (d: Date | string | undefined) => {
            if (!d) return true;
            const parsed = new Date(d as string | Date);
            if (Number.isNaN(parsed.getTime())) return false;
            const dayStr = localCalendarYmd(parsed);
            if (effFrom && dayStr < effFrom) return false;
            if (effTo && dayStr > effTo) return false;
            return true;
        };
    }, [effectiveDateRange]);

    const reportMonthsInFilter = useMemo(
        () => reportMonthsInDateRange(effectiveDateRange.from, effectiveDateRange.to),
        [effectiveDateRange],
    );

    const filteredByReportPeriod = useMemo(
        () => ({
            expenses: expenses.filter((e) =>
                recordMatchesReportPeriod(e.date, e.reportMonth, reportMonthsInFilter, isDateInRange),
            ),
            incomes: incomes.filter((i) =>
                recordMatchesReportPeriod(i.date, i.reportMonth, reportMonthsInFilter, isDateInRange),
            ),
        }),
        [expenses, incomes, reportMonthsInFilter, isDateInRange],
    );

    const objectStats = useMemo(() => {
        const map: Record<number, { expenses: number; incomes: number }> = {};
        filteredByReportPeriod.expenses.forEach((e) => {
            if (!map[e.objectId]) map[e.objectId] = { expenses: 0, incomes: 0 };
            map[e.objectId].expenses += getExpenseSum(e);
        });
        filteredByReportPeriod.incomes.forEach((i) => {
            if (!map[i.objectId]) map[i.objectId] = { expenses: 0, incomes: 0 };
            map[i.objectId].incomes += getIncomeSum(i);
        });
        return map;
    }, [filteredByReportPeriod]);

    const selectedObject = selectedObjectId === 'all'
        ? null
        : objects.find((o) => o.id === selectedObjectId);

    const roomsForSelectedObject = useMemo(
        () => (selectedObject ? selectedObject.roomTypes : []),
        [selectedObject],
    );

    const filteredRoomStats = useMemo(() => {
        if (!selectedObject) return [];

        const objectId = selectedObject.id;
        const objectPropertyId = selectedObject.propertyId;

        /** Бронь относится к выбранному объекту: Beds24 propertyId или внутренний id; если propertyId нет — доверяем привязке записи к objectId */
        const bookingBelongsToObject = (booking: Booking) => {
            const bp = booking.propertyId;
            if (bp === undefined || bp === null) return true;
            return bp === objectPropertyId || bp === objectId;
        };

        /**
         * Комната для строки сводки:
         * 1) roomId из проводки, если он есть в справочнике комнат объекта — приоритет бух. привязки;
         * 2) иначе unitId брони Beds24, если он в справочнике;
         * 3) иначе roomId проводки даже вне справочника (как запасной якорь).
         */
        const roomIdSet = new Set(roomsForSelectedObject.map((r) => r.id));

        const resolveRecordRoomId = (
            recordObjectId: number,
            recordRoomId?: number,
            bookingId?: number,
        ): number | null => {
            if (!recordObjectMatchesSelected(recordObjectId, selectedObject, objects)) return null;

            const ridExplicit = normalizeUnitOrRoomId(recordRoomId);
            if (ridExplicit != null && roomIdSet.has(ridExplicit)) {
                return ridExplicit;
            }

            const bid = normalizeUnitOrRoomId(bookingId);
            if (bid != null) {
                const booking = bookings.find((b) => normalizeUnitOrRoomId(b.id) === bid);
                if (booking && bookingBelongsToObject(booking)) {
                    const uid = normalizeUnitOrRoomId(booking.unitId);
                    if (uid != null && roomIdSet.has(uid)) {
                        return uid;
                    }
                }
            }

            if (ridExplicit != null) return ridExplicit;
            return null;
        };

        const expenseRoomId = (e: Expense) =>
            resolveRecordRoomId(e.objectId, e.roomId, e.bookingId);

        const incomeRoomId = (i: Income) =>
            resolveRecordRoomId(i.objectId, i.roomId, i.bookingId);

        const roomRows = roomsForSelectedObject.map((room) => {
            let expenses = 0;
            let incomes = 0;
            filteredByReportPeriod.expenses.forEach((e) => {
                if (expenseRoomId(e) === room.id) expenses += getExpenseSum(e);
            });
            filteredByReportPeriod.incomes.forEach((i) => {
                if (incomeRoomId(i) === room.id) incomes += getIncomeSum(i);
            });
            return {
                roomId: room.id,
                roomName: room.name || `Room ${room.id}`,
                expenses,
                incomes,
            };
        });

        let orphanExp = 0;
        let orphanInc = 0;
        filteredByReportPeriod.expenses.forEach((e) => {
            if (!recordObjectMatchesSelected(e.objectId, selectedObject, objects)) return;
            if (expenseRoomId(e) === null) orphanExp += getExpenseSum(e);
        });
        filteredByReportPeriod.incomes.forEach((i) => {
            if (!recordObjectMatchesSelected(i.objectId, selectedObject, objects)) return;
            if (incomeRoomId(i) === null) orphanInc += getIncomeSum(i);
        });

        const rows: Array<{ roomId: number; roomName: string; expenses: number; incomes: number }> =
            selectedRoomId === 'all' && (orphanExp > 0 || orphanInc > 0)
                ? [
                      ...roomRows,
                      {
                          roomId: ACCOUNTANCY_UNALLOCATED_ROOM_ID,
                          roomName: t('accountancy.unallocatedRoomStats'),
                          expenses: orphanExp,
                          incomes: orphanInc,
                      },
                  ]
                : roomRows;

        return selectedRoomId === 'all' ? rows : rows.filter((row) => row.roomId === selectedRoomId);
    }, [selectedObject, roomsForSelectedObject, filteredByReportPeriod, bookings, selectedRoomId, t, objects]);

    // Варианты месяцев для поля «Месяц отчёта» (последние 24 месяца)
    const reportMonthOptions = useMemo(() => {
        const options: { value: string; label: string }[] = [];
        const now = new Date();
        for (let i = 0; i < 24; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const value = `${y}-${String(m).padStart(2, '0')}`;
            options.push({ value, label: `${m}.${y}` });
        }
        return options;
    }, []);

    const filteredOperations = useMemo((): OperationRow[] => {
        if (selectedObjectId === 'all' || !selectedObject) return [];

        const matchRoom = (roomId?: number, bookingId?: number) => {
            if (selectedRoomId === 'all') return true;
            // Прямая привязка к комнате
            if (roomId === selectedRoomId) return true;
            // Привязка через бронирование
            if (!bookingId) return false;
            const booking = bookings.find((b) => b.id === bookingId);
            if (!booking) return false;
            return (
                (booking.propertyId ?? null) === selectedObjectId &&
                (booking.unitId ?? null) === selectedRoomId
            );
        };

        const rows: OperationRow[] = [];

        expenses
            .filter(
                (e) =>
                    recordObjectMatchesSelected(e.objectId, selectedObject, objects) &&
                    matchRoom(e.roomId, e.bookingId) &&
                    recordMatchesReportPeriod(e.date, e.reportMonth, reportMonthsInFilter, isDateInRange),
            )
            .forEach((e) => {
                rows.push({
                    id: `exp-${e._id ?? ''}`,
                    type: 'expense',
                    entityId: e._id ?? '',
                    status: e.status,
                    date: e.date,
                    category: e.category ?? '',
                    comment: e.comment ?? '',
                    quantity: e.quantity ?? 1,
                    amount: -getExpenseSum(e),
                    reportMonth: e.reportMonth ?? '',
                    source: e.source,
                    recipient: e.recipient,
                    autoCreated: !!(e as Expense & { autoCreated?: unknown }).autoCreated,
                });
            });

        incomes
            .filter(
                (i) =>
                    recordObjectMatchesSelected(i.objectId, selectedObject, objects) &&
                    matchRoom(i.roomId, i.bookingId) &&
                    recordMatchesReportPeriod(i.date, i.reportMonth, reportMonthsInFilter, isDateInRange),
            )
            .forEach((i) => {
                rows.push({
                    id: `inc-${i._id ?? ''}`,
                    type: 'income',
                    entityId: i._id ?? '',
                    status: (i as any).status ?? 'draft',
                    date: i.date,
                    category: i.category ?? '',
                    comment: i.comment ?? '',
                    quantity: i.quantity ?? 1,
                    amount: getIncomeSum(i),
                    reportMonth: i.reportMonth ?? '',
                    source: i.source,
                    recipient: i.recipient,
                    autoCreated: !!(i as Income & { autoCreated?: unknown }).autoCreated,
                });
            });

        rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return rows;
    }, [
        selectedObjectId,
        selectedObject,
        selectedRoomId,
        expenses,
        incomes,
        bookings,
        isDateInRange,
        reportMonthsInFilter,
        objects,
    ]);

    const handleStatusToggle = async (row: OperationRow) => {
        if (!row.entityId) return;
        const newStatus = row.status === 'confirmed' ? 'draft' : 'confirmed';
        setStatusUpdatingId(row.id);
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row.entityId);
                if (!expense) return;
                const payload: Expense = {
                    ...expense,
                    status: newStatus,
                    date: expense.date
                        ? (typeof expense.date === 'string' ? new Date(expense.date) : expense.date)
                        : new Date(),
                };
                const res = await updateExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) => (e._id === row.entityId ? { ...e, status: newStatus } : e)),
                    );
                }
            } else {
                const income = incomes.find((i) => i._id === row.entityId);
                if (!income) return;
                const payload: Income = {
                    ...income,
                    status: newStatus,
                    date: income.date
                        ? (typeof income.date === 'string' ? new Date(income.date) : income.date)
                        : new Date(),
                };
                const res = await updateIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) => (i._id === row.entityId ? { ...i, status: newStatus } : i)),
                    );
                }
            }
        } catch (error) {
            console.error('Error updating status:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setStatusUpdatingId(null);
        }
    };

    const handleReportMonthChange = async (row: OperationRow, newValue: string) => {
        if (!row.entityId) return;
        setReportMonthUpdatingId(row.id);
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row.entityId);
                if (!expense) return;
                const payload: Expense = {
                    ...expense,
                    date: expense.date
                        ? (typeof expense.date === 'string' ? new Date(expense.date) : expense.date)
                        : new Date(),
                    reportMonth: newValue || undefined,
                };
                const res = await updateExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) => (e._id === row.entityId ? { ...e, reportMonth: newValue || undefined } : e)),
                    );
                }
            } else {
                const income = incomes.find((i) => i._id === row.entityId);
                if (!income) return;
                const payload: Income = {
                    ...income,
                    date: income.date
                        ? (typeof income.date === 'string' ? new Date(income.date) : income.date)
                        : new Date(),
                    reportMonth: newValue || undefined,
                };
                const res = await updateIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) => (i._id === row.entityId ? { ...i, reportMonth: newValue || undefined } : i)),
                    );
                }
            }
        } catch (error) {
            console.error('Error updating report month:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setReportMonthUpdatingId(null);
        }
    };

    const handleQuantityChange = async (row: OperationRow, newQuantity: number) => {
        if (!row.entityId || newQuantity < 1) return;
        setQuantityUpdatingId(row.id);
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row.entityId);
                if (!expense) return;
                const payload: Expense = {
                    ...expense,
                    date: expense.date
                        ? (typeof expense.date === 'string' ? new Date(expense.date) : expense.date)
                        : new Date(),
                    quantity: newQuantity,
                };
                const res = await updateExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) => (e._id === row.entityId ? { ...e, quantity: newQuantity } : e)),
                    );
                }
            } else {
                const income = incomes.find((i) => i._id === row.entityId);
                if (!income) return;
                const payload: Income = {
                    ...income,
                    date: income.date
                        ? (typeof income.date === 'string' ? new Date(income.date) : income.date)
                        : new Date(),
                    quantity: newQuantity,
                };
                const res = await updateIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) => (i._id === row.entityId ? { ...i, quantity: newQuantity } : i)),
                    );
                }
            }
        } catch (error) {
            console.error('Error updating quantity:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setQuantityUpdatingId(null);
        }
    };

    const handleCategoryChange = async (row: OperationRow, newCategory: string) => {
        if (!row.entityId) return;
        if (!newCategory.trim()) {
            setSnackbar({
                open: true,
                message: t('accountancy.formErrors'),
                severity: 'error',
            });
            return;
        }
        if (newCategory === row.category) return;
        setInlinePatchUpdatingId(row.id);
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row.entityId);
                if (!expense) return;
                const payload: Expense = {
                    ...expense,
                    date: expense.date
                        ? (typeof expense.date === 'string' ? new Date(expense.date) : expense.date)
                        : new Date(),
                    category: newCategory,
                };
                const res = await updateExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) => (e._id === row.entityId ? { ...e, category: newCategory } : e)),
                    );
                }
            } else {
                const income = incomes.find((i) => i._id === row.entityId);
                if (!income) return;
                const payload: Income = {
                    ...income,
                    date: income.date
                        ? (typeof income.date === 'string' ? new Date(income.date) : income.date)
                        : new Date(),
                    category: newCategory,
                };
                const res = await updateIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) => (i._id === row.entityId ? { ...i, category: newCategory } : i)),
                    );
                }
            }
        } catch (error) {
            console.error('Error updating category:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setInlinePatchUpdatingId(null);
        }
    };

    const handleCommentCommit = async (row: OperationRow, draft: string) => {
        if (!row.entityId) return;
        const next = draft;
        const prev = row.comment ?? '';
        if (next === prev) return;
        setInlinePatchUpdatingId(row.id);
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row.entityId);
                if (!expense) return;
                const payload: Expense = {
                    ...expense,
                    date: expense.date
                        ? (typeof expense.date === 'string' ? new Date(expense.date) : expense.date)
                        : new Date(),
                    comment: next || undefined,
                };
                const res = await updateExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) => (e._id === row.entityId ? { ...e, comment: next || undefined } : e)),
                    );
                }
            } else {
                const income = incomes.find((i) => i._id === row.entityId);
                if (!income) return;
                const payload: Income = {
                    ...income,
                    date: income.date
                        ? (typeof income.date === 'string' ? new Date(income.date) : income.date)
                        : new Date(),
                    comment: next || undefined,
                };
                const res = await updateIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) => (i._id === row.entityId ? { ...i, comment: next || undefined } : i)),
                    );
                }
            }
        } catch (error) {
            console.error('Error updating comment:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setInlinePatchUpdatingId(null);
        }
    };

    const handleSourceChange = async (row: OperationRow, value: SourceRecipientOptionValue | '') => {
        if (!row.entityId) return;
        const next = value || undefined;
        const prev = row.source || undefined;
        if (next === prev) return;
        setInlinePatchUpdatingId(row.id);
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row.entityId);
                if (!expense) return;
                const payload: Expense = {
                    ...expense,
                    date: expense.date
                        ? (typeof expense.date === 'string' ? new Date(expense.date) : expense.date)
                        : new Date(),
                    source: next,
                };
                const res = await updateExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) => (e._id === row.entityId ? { ...e, source: next } : e)),
                    );
                }
            } else {
                const income = incomes.find((i) => i._id === row.entityId);
                if (!income) return;
                const payload: Income = {
                    ...income,
                    date: income.date
                        ? (typeof income.date === 'string' ? new Date(income.date) : income.date)
                        : new Date(),
                    source: next,
                };
                const res = await updateIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) => (i._id === row.entityId ? { ...i, source: next } : i)),
                    );
                }
            }
        } catch (error) {
            console.error('Error updating source:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setInlinePatchUpdatingId(null);
        }
    };

    const handleRecipientChange = async (row: OperationRow, value: SourceRecipientOptionValue | '') => {
        if (!row.entityId) return;
        const next = value || undefined;
        const prev = row.recipient || undefined;
        if (next === prev) return;
        setInlinePatchUpdatingId(row.id);
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row.entityId);
                if (!expense) return;
                const payload: Expense = {
                    ...expense,
                    date: expense.date
                        ? (typeof expense.date === 'string' ? new Date(expense.date) : expense.date)
                        : new Date(),
                    recipient: next,
                };
                const res = await updateExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) => (e._id === row.entityId ? { ...e, recipient: next } : e)),
                    );
                }
            } else {
                const income = incomes.find((i) => i._id === row.entityId);
                if (!income) return;
                const payload: Income = {
                    ...income,
                    date: income.date
                        ? (typeof income.date === 'string' ? new Date(income.date) : income.date)
                        : new Date(),
                    recipient: next,
                };
                const res = await updateIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) => (i._id === row.entityId ? { ...i, recipient: next } : i)),
                    );
                }
            }
        } catch (error) {
            console.error('Error updating recipient:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setInlinePatchUpdatingId(null);
        }
    };

    const handleOperationAmountCommit = async (row: OperationRow, draft: string) => {
        if (amountEditEscapeRef.current) {
            amountEditEscapeRef.current = false;
            return;
        }
        if (!row.entityId) {
            setAmountEditingId(null);
            setAmountDraft('');
            return;
        }
        const parsed = parseLocalizedTotalAmount(draft);
        if (parsed === null) {
            setSnackbar({
                open: true,
                message: t('accountancy.invalidTotalAmount'),
                severity: 'error',
            });
            return;
        }
        const q = row.quantity || 1;
        const currentAbs = Math.abs(row.amount);
        if (Math.abs(parsed - currentAbs) < 1e-6) {
            setAmountEditingId(null);
            setAmountDraft('');
            return;
        }
        const newUnitAmount = parsed / q;

        setAmountUpdatingId(row.id);
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row.entityId);
                if (!expense) return;
                const payload: Expense = {
                    ...expense,
                    date: expense.date
                        ? (typeof expense.date === 'string' ? new Date(expense.date) : expense.date)
                        : new Date(),
                    amount: newUnitAmount,
                };
                const res = await updateExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) => (e._id === row.entityId ? { ...e, amount: newUnitAmount } : e)),
                    );
                }
            } else {
                const income = incomes.find((i) => i._id === row.entityId);
                if (!income) return;
                const payload: Income = {
                    ...income,
                    date: income.date
                        ? (typeof income.date === 'string' ? new Date(income.date) : income.date)
                        : new Date(),
                    amount: newUnitAmount,
                };
                const res = await updateIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) => (i._id === row.entityId ? { ...i, amount: newUnitAmount } : i)),
                    );
                }
            }
        } catch (error) {
            console.error('Error updating amount:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setAmountUpdatingId(null);
            setAmountEditingId(null);
            setAmountDraft('');
        }
    };

    const handleOperationDeleteClick = (row: OperationRow) => {
        setOperationToDelete(row);
        setDeleteDialogOpen(true);
    };

    const handleOperationDeleteCancel = () => {
        setDeleteDialogOpen(false);
        setOperationToDelete(null);
    };

    const handleOperationDeleteConfirm = async () => {
        if (!operationToDelete?.entityId) return;
        setOperationDeletingId(operationToDelete.id);
        try {
            const res =
                operationToDelete.type === 'expense'
                    ? await deleteExpense(operationToDelete.entityId)
                    : await deleteIncome(operationToDelete.entityId);
            setSnackbar({
                open: true,
                message:
                    res.message ||
                    (operationToDelete.type === 'expense'
                        ? t('accountancy.expenseDeleted')
                        : t('accountancy.incomeDeleted')),
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                if (operationToDelete.type === 'expense') {
                    setExpenses((prev) => prev.filter((e) => e._id !== operationToDelete.entityId));
                } else {
                    setIncomes((prev) => prev.filter((i) => i._id !== operationToDelete.entityId));
                }
            }
        } catch (error) {
            console.error('Error deleting operation:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setOperationDeletingId(null);
            setDeleteDialogOpen(false);
            setOperationToDelete(null);
        }
    };

    const quantityOptions = useMemo(() => {
        const opts: number[] = [];
        for (let i = 1; i <= 8; i++) opts.push(i);
        return opts;
    }, []);

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('menu.accountancy')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('menu.accountancy')}
            </Typography>

            

            <Stack spacing={2} direction={'row'} mb={3}>
                <Link href="/dashboard/accountancy/transactions">
                    <Button fullWidth variant="contained">
                        {t('accountancy.transactionsTitle')}
                    </Button>
                </Link>

                <Link href="/dashboard/accountancy/reports">
                    <Button
                        fullWidth
                        variant="contained"
                    >
                        Отчёты
                    </Button>
                </Link>

                <Link href="/dashboard/accountancy/categories">
                    <Button
                        fullWidth
                        variant="outlined"
                    >
                        {t('accountancy.categoriesTitle')}
                    </Button>
                </Link>

                <Link href="/dashboard/accountancy/counterparties">
                    <Button
                        fullWidth
                        variant="outlined"
                    >
                        {t('accountancy.counterparty.title')}
                    </Button>
                </Link>

                <Link href="/dashboard/accountancy/cashflow">
                    <Button
                        fullWidth
                        variant="outlined"
                    >
                        {t('accountancy.cashflow.title')}
                    </Button>
                </Link>

                <Link href="/dashboard/accountancy/commission">
                    <Button
                        fullWidth
                        variant="contained"
                    >
                        {t('accountancy.commission.title')}
                    </Button>
                </Link>

                <Link href="/dashboard/accountancy/auto-accounting">
                    <Button
                        fullWidth
                        variant="outlined"
                    >
                        {t('accountancy.autoAccounting.title')}
                    </Button>
                </Link>
            </Stack>

            {/* <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mb: 3 }}>
                <Paper sx={{ p: 2, flexBasis: '33%' }}>
                    <Typography variant="subtitle2" color="text.secondary">
                        {t('accountancy.totalExpenses')}
                    </Typography>
                    <Typography variant="h6" color="error">
                        {formatAmount(-totalExpenses)}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flexBasis: '33%' }}>
                    <Typography variant="subtitle2" color="text.secondary">
                        {t('accountancy.totalIncomes')}
                    </Typography>
                    <Typography variant="h6" color="success.main">
                        {formatAmount(totalIncomes)}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flexBasis: '33%' }}>
                    <Typography variant="subtitle2" color="text.secondary">
                        {t('accountancy.balance')}
                    </Typography>
                    <Typography variant="h6" color={balance >= 0 ? 'success.main' : 'error'}>
                        {formatAmount(balance)}
                    </Typography>
                </Paper>
            </Stack> */}

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mb: 3 }}>
                <Paper sx={{ p: 2, width: 250 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        {t('accountancy.statsByObject')}
                    </Typography>
                    <Table size="small" sx={{ fontSize: '0.75rem', '& .MuiTableCell-root': { py: 0.5, px: 1 } }}>
                        <TableBody>
                            {objects.map((obj) => {
                                const stat = objectStats[obj.id] || { expenses: 0, incomes: 0 };
                                const rowBalance = stat.incomes - stat.expenses;
                                const isObjectRowSelected = selectedObjectId !== 'all' && selectedObjectId === obj.id;
                                return (
                                    <TableRow
                                        key={`${obj.propertyName || 'obj'}-${obj.id}`}
                                        hover
                                        selected={isObjectRowSelected}
                                        onClick={() => {
                                            setSelectedObjectId(obj.id);
                                            setSelectedRoomId('all');
                                        }}
                                        sx={{
                                            cursor: 'pointer',
                                            '&.Mui-selected': {
                                                bgcolor: 'action.selected',
                                                '&:hover': { bgcolor: 'action.selected' },
                                            },
                                        }}
                                    >
                                        <TableCell sx={{ py: 0.5, px: 1 }}>{obj.name}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Paper>

                <Paper sx={{ p: 1.5, flex: 2, minWidth: 0 }}>
                    <Typography variant="h6" sx={{ mb: 1.5, fontSize: '1.05rem' }}>
                        {t('accountancy.statsByRoom')}
                    </Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                        <FormControl sx={{ minWidth: 200 }} size="small">
                            <InputLabel>{t('accountancy.selectMonth')}</InputLabel>
                            <Select
                                label={t('accountancy.selectMonth')}
                                value={selectedMonth}
                                onChange={(e) => {
                                    const value = e.target.value as string;
                                    setSelectedMonth(value);
                                    if (value) {
                                        const [y, m] = value.split('-').map(Number);
                                        const from = new Date(y, m - 1, 1);
                                        const to = new Date(y, m, 0);
                                        setDateFrom(localCalendarYmd(from));
                                        setDateTo(localCalendarYmd(to));
                                    }
                                }}
                            >
                                <MenuItem value="">
                                    <em>{t('analytics.customPeriod')}</em>
                                </MenuItem>
                                {(() => {
                                    const options: { value: string; label: string }[] = [];
                                    const now = new Date();
                                    for (let i = 0; i < 24; i++) {
                                        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                                        const y = d.getFullYear();
                                        const m = d.getMonth() + 1;
                                        const value = `${y}-${String(m).padStart(2, '0')}`;
                                        const monthName = t(`accountancy.months.${m}`);
                                        options.push({ value, label: `${monthName} ${y}` });
                                    }
                                    return options.map((o) => (
                                        <MenuItem key={o.value} value={o.value}>
                                            {o.label}
                                        </MenuItem>
                                    ));
                                })()}
                            </Select>
                        </FormControl>
                        <TextField
                            type="date"
                            label={t('analytics.from')}
                            InputLabelProps={{ shrink: true }}
                            value={dateFrom}
                            onChange={(e) => {
                                setDateFrom(e.target.value);
                                setSelectedMonth('');
                            }}
                            size="small"
                            sx={{ maxWidth: 200 }}
                        />
                        <TextField
                            type="date"
                            label={t('analytics.to')}
                            InputLabelProps={{ shrink: true }}
                            value={dateTo}
                            onChange={(e) => {
                                setDateTo(e.target.value);
                                setSelectedMonth('');
                            }}
                            size="small"
                            sx={{ maxWidth: 200 }}
                        />
                        <FormControl sx={{ minWidth: 180 }} size="small">
                            <InputLabel>{t('common.object')}</InputLabel>
                            <Select
                                label={t('common.object')}
                                value={selectedObjectId === 'all' ? '' : String(selectedObjectId)}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setSelectedObjectId(value ? Number(value) : 'all');
                                    setSelectedRoomId('all');
                                }}
                            >
                                <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                {objects.map((obj) => (
                                    <MenuItem key={`${obj.propertyName || 'obj'}-${obj.id}`} value={String(obj.id)}>
                                        {obj.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {selectedObject && (
                            <FormControl sx={{ minWidth: 180 }}>
                                <InputLabel>{t('common.room')}</InputLabel>
                                <Select
                                    label={t('common.room')}
                                    value={selectedRoomId === 'all' ? '' : String(selectedRoomId)}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setSelectedRoomId(value ? Number(value) : 'all');
                                    }}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {roomsForSelectedObject.map((room) => (
                                        <MenuItem key={room.id} value={String(room.id)}>
                                            {room.name || `Room ${room.id}`}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    </Stack>

                    {loading ? (
                        <Typography>{t('accountancy.loading')}</Typography>
                    ) : !selectedObject || filteredRoomStats.length === 0 ? (
                        <Typography color="text.secondary">
                            {t('accountancy.noStatsForSelection')}
                        </Typography>
                    ) : (
                        <>
                            <Table size="small" sx={{ fontSize: '0.75rem', '& .MuiTableCell-root': { py: 0.5, px: 1 } }}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('common.room')}</TableCell>
                                        <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.amountColumn')} ({t('accountancy.expensesTitle')})</TableCell>
                                        <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.amountColumn')} ({t('accountancy.incomesTitle')})</TableCell>
                                        <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.balance')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredRoomStats.map((row) => {
                                        const balance = row.incomes - row.expenses;
                                        const isUnallocatedRow = row.roomId === ACCOUNTANCY_UNALLOCATED_ROOM_ID;
                                        return (
                                            <TableRow
                                                key={row.roomId}
                                                onClick={
                                                    isUnallocatedRow
                                                        ? undefined
                                                        : () => setSelectedRoomId(row.roomId)
                                                }
                                                sx={{
                                                    cursor: isUnallocatedRow ? 'default' : 'pointer',
                                                    '&:hover': {
                                                        bgcolor: isUnallocatedRow ? undefined : 'action.hover',
                                                    },
                                                }}
                                            >
                                                <TableCell sx={{ py: 0.5, px: 1 }}>{row.roomName}</TableCell>
                                                <TableCell sx={{ py: 0.5, px: 1 }}>{formatAmount(row.expenses)}</TableCell>
                                                <TableCell sx={{ py: 0.5, px: 1 }}>{formatAmount(row.incomes)}</TableCell>
                                                <TableCell sx={{ py: 0.5, px: 1, color: balance >= 0 ? 'success.main' : 'error.main' }}>
                                                    {formatAmount(balance)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>

                            {selectedObject && (
                                <>
                                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>
                                        {t('accountancy.operationsList')}
                                    </Typography>
                                    {filteredOperations.length === 0 ? (
                                        <Typography color="text.secondary">
                                            {t('accountancy.noOperations')}
                                        </Typography>
                                    ) : (
                                        <TableContainer
                                            sx={{
                                                mt: 0.5,
                                                width: '100%',
                                                maxWidth: '100%',
                                                overflowX: 'auto',
                                                overflowY: 'visible',
                                            }}
                                        >
                                        <Table
                                            stickyHeader
                                            size="small"
                                            sx={{
                                                tableLayout: 'fixed',
                                                width: '100%',
                                                minWidth: OP_TABLE_MIN_WIDTH_PX,
                                                fontSize: '0.6875rem',
                                                '& .MuiTableCell-root': {
                                                    py: 0.5,
                                                    px: 0.5,
                                                    verticalAlign: 'middle',
                                                    lineHeight: 1.2,
                                                },
                                                '& .MuiTableCell-head': {
                                                    py: 0.4,
                                                    px: 0.5,
                                                    fontSize: '0.65rem',
                                                    fontWeight: 600,
                                                    lineHeight: 1.1,
                                                    backgroundColor: 'background.paper',
                                                },
                                                '& .MuiSwitch-root': { transform: 'scale(0.62)' },
                                                '& .MuiIconButton-root': { p: 0.2 },
                                            }}
                                        >
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ width: 44 }}>{t('common.status')}</TableCell>
                                                    <TableCell sx={{ width: OP_TABLE_SELECT_WIDTH_PX }}>{t('accountancy.reportMonth')}</TableCell>
                                                    <TableCell sx={{ width: 72, pl: 1 }}>{t('accountancy.dateColumn')}</TableCell>
                                                    <TableCell sx={{ width: OP_TABLE_CATEGORY_COL_WIDTH_PX }}>{t('accountancy.categoryColumn')}</TableCell>
                                                    <TableCell sx={{ width: OP_TABLE_COMMENT_COL_WIDTH_PX, minWidth: OP_TABLE_COMMENT_COL_WIDTH_PX }}>
                                                        {t('accountancy.comment')}
                                                    </TableCell>
                                                    <TableCell sx={{ width: OP_TABLE_QTY_COL_WIDTH_PX }}>{t('accountancy.quantity')}</TableCell>
                                                    <TableCell sx={{ width: 80 }}>{t('accountancy.amountColumn')}</TableCell>
                                                    <TableCell sx={{ width: OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX }}>{t('accountancy.source')}</TableCell>
                                                    <TableCell sx={{ width: OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX }}>{t('accountancy.recipient')}</TableCell>
                                                    <TableCell sx={{ width: 52, px: 0.25 }} />
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {filteredOperations.map((row) => (
                                                    <TableRow
                                                        key={row.id}
                                                        sx={
                                                            row.autoCreated
                                                                ? { bgcolor: (theme) => (theme.palette.mode === 'light' ? 'rgba(46, 125, 50, 0.06)' : 'rgba(102, 187, 106, 0.1)') }
                                                                : undefined
                                                        }
                                                    >
                                                        <TableCell sx={{ px: 0.25 }}>
                                                            <Tooltip title={row.status === 'confirmed' ? t('accountancy.statusConfirmed') : t('accountancy.statusDraft')}>
                                                            <Switch
                                                                    checked={row.status === 'confirmed'}
                                                                    onChange={() => handleStatusToggle(row)}
                                                                    disabled={
                                                                        statusUpdatingId === row.id ||
                                                                        inlinePatchUpdatingId === row.id
                                                                    }
                                                                    size="small"
                                                                    color="primary"
                                                                />
                                                            </Tooltip>
                                                        </TableCell>
                                                        <TableCell sx={{ px: 0.25 }}>
                                                            <FormControl size="small" sx={opTableSelectFormSx}>
                                                                <Select
                                                                    sx={opTableSelectSx}
                                                                    value={row.reportMonth || ''}
                                                                    displayEmpty
                                                                    onChange={(e) =>
                                                                        handleReportMonthChange(row, e.target.value as string)
                                                                    }
                                                                    disabled={
                                                                        reportMonthUpdatingId === row.id ||
                                                                        inlinePatchUpdatingId === row.id
                                                                    }
                                                                    MenuProps={{ PaperProps: { sx: { maxHeight: 280 } } }}
                                                                >
                                                                    <MenuItem value="">
                                                                        <em>—</em>
                                                                    </MenuItem>
                                                                    {reportMonthOptions.map((o) => (
                                                                        <MenuItem key={o.value} value={o.value}>
                                                                            {o.label}
                                                                        </MenuItem>
                                                                    ))}
                                                                </Select>
                                                            </FormControl>
                                                        </TableCell>
                                                        <TableCell sx={{ px: 0.25, pl: 1, fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                                                            {row.date
                                                                ? new Date(row.date).toLocaleDateString('ru-RU', {
                                                                      day: '2-digit',
                                                                      month: '2-digit',
                                                                      year: '2-digit',
                                                                  })
                                                                : '—'}
                                                        </TableCell>
                                                        <TableCell sx={{ px: 0.25, overflow: 'hidden' }}>
                                                            <Stack
                                                                direction="row"
                                                                alignItems="center"
                                                                spacing={0.5}
                                                                flexWrap="nowrap"
                                                                sx={{ minWidth: 0 }}
                                                            >
                                                                <FormControl
                                                                    size="small"
                                                                    sx={{ ...opTableCatSelectFormSx, flexShrink: 0 }}
                                                                >
                                                                    <Select
                                                                        sx={opTableInlineSelectSx}
                                                                        IconComponent={() => null}
                                                                        value={row.category || ''}
                                                                        displayEmpty
                                                                        onChange={(e) =>
                                                                            void handleCategoryChange(
                                                                                row,
                                                                                e.target.value as string,
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            inlinePatchUpdatingId === row.id ||
                                                                            quantityUpdatingId === row.id ||
                                                                            reportMonthUpdatingId === row.id ||
                                                                            statusUpdatingId === row.id
                                                                        }
                                                                        MenuProps={{ PaperProps: { sx: { maxHeight: 280 } } }}
                                                                    >
                                                                        <MenuItem value="">
                                                                            <em>—</em>
                                                                        </MenuItem>
                                                                        {(() => {
                                                                            const catList =
                                                                                row.type === 'expense'
                                                                                    ? categoriesExpense
                                                                                    : categoriesIncome;
                                                                            const items = buildCategoriesForSelect(
                                                                                catList,
                                                                                row.type === 'expense'
                                                                                    ? 'expense'
                                                                                    : 'income',
                                                                            );
                                                                            const names = new Set(
                                                                                items.map((it) => it.name),
                                                                            );
                                                                            const orphan =
                                                                                !!(
                                                                                    row.category &&
                                                                                    !names.has(row.category)
                                                                                );
                                                                            return [
                                                                                ...(orphan
                                                                                    ? [
                                                                                          <MenuItem
                                                                                              key={`orphan-${row.id}`}
                                                                                              value={row.category}
                                                                                          >
                                                                                              {row.category}
                                                                                          </MenuItem>,
                                                                                      ]
                                                                                    : []),
                                                                                ...items.map((item) => (
                                                                                    <MenuItem
                                                                                        key={item.id}
                                                                                        value={item.name}
                                                                                    >
                                                                                        {item.depth > 0
                                                                                            ? '\u00A0'.repeat(
                                                                                                  item.depth * 2,
                                                                                              ) + '↳ '
                                                                                            : ''}
                                                                                        {item.name}
                                                                                    </MenuItem>
                                                                                )),
                                                                            ];
                                                                        })()}
                                                                    </Select>
                                                                </FormControl>
                                                                {row.autoCreated && (
                                                                    <Tooltip
                                                                        title={t('accountancy.autoAccounting.autoCreatedBadge')}
                                                                    >
                                                                        <Chip
                                                                            size="small"
                                                                            label={t(
                                                                                'accountancy.autoAccounting.autoCreatedBadge',
                                                                            )}
                                                                            color="success"
                                                                            variant="outlined"
                                                                            sx={{
                                                                                height: 22,
                                                                                flexShrink: 0,
                                                                                maxWidth: 'none',
                                                                                '& .MuiChip-label': {
                                                                                    px: 0.5,
                                                                                    fontSize: '0.6rem',
                                                                                    lineHeight: 1.2,
                                                                                },
                                                                            }}
                                                                        />
                                                                    </Tooltip>
                                                                )}
                                                            </Stack>
                                                        </TableCell>
                                                        <TableCell sx={{ px: 0.25, minWidth: OP_TABLE_COMMENT_COL_WIDTH_PX, width: OP_TABLE_COMMENT_COL_WIDTH_PX }}>
                                                            <TextField
                                                                size="small"
                                                                fullWidth
                                                                value={
                                                                    commentDraftByRowId[row.id] !== undefined
                                                                        ? commentDraftByRowId[row.id]!
                                                                        : row.comment
                                                                }
                                                                onChange={(e) =>
                                                                    setCommentDraftByRowId((prev) => ({
                                                                        ...prev,
                                                                        [row.id]: e.target.value,
                                                                    }))
                                                                }
                                                                onBlur={() => {
                                                                    const draft = commentDraftByRowId[row.id];
                                                                    if (draft === undefined) return;
                                                                    setCommentDraftByRowId((prev) => {
                                                                        const next = { ...prev };
                                                                        delete next[row.id];
                                                                        return next;
                                                                    });
                                                                    void handleCommentCommit(row, draft);
                                                                }}
                                                                placeholder={t('accountancy.comment')}
                                                                disabled={
                                                                    inlinePatchUpdatingId === row.id ||
                                                                    quantityUpdatingId === row.id ||
                                                                    reportMonthUpdatingId === row.id ||
                                                                    statusUpdatingId === row.id
                                                                }
                                                                slotProps={{
                                                                    htmlInput: {
                                                                        'aria-label': t('accountancy.comment'),
                                                                    },
                                                                }}
                                                                sx={{
                                                                    '& .MuiInputBase-input': {
                                                                        fontSize: '0.6875rem',
                                                                        py: '3px',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        whiteSpace: 'nowrap',
                                                                    },
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell sx={{ px: 0.25 }}>
                                                            <FormControl size="small" sx={opTableQtySelectFormSx}>
                                                                <Select
                                                                    sx={opTableSelectSx}
                                                                    value={row.quantity}
                                                                    onChange={(e) =>
                                                                        handleQuantityChange(row, Number(e.target.value))
                                                                    }
                                                                    disabled={
                                                                        quantityUpdatingId === row.id ||
                                                                        inlinePatchUpdatingId === row.id
                                                                    }
                                                                    MenuProps={{ PaperProps: { sx: { maxHeight: 280 } } }}
                                                                >
                                                                    {!quantityOptions.includes(row.quantity) &&
                                                                    row.quantity >= 1 ? (
                                                                        <MenuItem
                                                                            key={`qty-outofrange-${row.id}`}
                                                                            value={row.quantity}
                                                                        >
                                                                            {row.quantity}
                                                                        </MenuItem>
                                                                    ) : null}
                                                                    {quantityOptions.map((q) => (
                                                                        <MenuItem key={q} value={q}>
                                                                            {q}
                                                                        </MenuItem>
                                                                    ))}
                                                                </Select>
                                                            </FormControl>
                                                        </TableCell>
                                                        <TableCell
                                                            sx={{
                                                                px: 0.25,
                                                                color: row.amount >= 0 ? 'success.main' : 'error.main',
                                                                verticalAlign: 'middle',
                                                                fontSize: '0.6875rem',
                                                            }}
                                                        >
                                                            {amountEditingId === row.id ? (
                                                                <TextField
                                                                    size="small"
                                                                    value={amountDraft}
                                                                    onChange={(e) => setAmountDraft(e.target.value)}
                                                                    onBlur={(e) => void handleOperationAmountCommit(row, e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            e.preventDefault();
                                                                            (e.target as HTMLInputElement).blur();
                                                                        } else if (e.key === 'Escape') {
                                                                            e.preventDefault();
                                                                            amountEditEscapeRef.current = true;
                                                                            setAmountEditingId(null);
                                                                            setAmountDraft('');
                                                                        }
                                                                    }}
                                                                    disabled={
                                                                        amountUpdatingId === row.id ||
                                                                        inlinePatchUpdatingId === row.id
                                                                    }
                                                                    autoFocus
                                                                    slotProps={{
                                                                        htmlInput: {
                                                                            inputMode: 'decimal',
                                                                            'aria-label': t('accountancy.amountColumn'),
                                                                        },
                                                                    }}
                                                                    sx={{
                                                                        width: 76,
                                                                        '& .MuiInputBase-input': {
                                                                            fontSize: '0.6875rem',
                                                                            py: '3px',
                                                                        },
                                                                    }}
                                                                />
                                                            ) : (
                                                                <Tooltip title={t('accountancy.inlineAmountEditHint')}>
                                                                    <Box
                                                                        component="span"
                                                                        onClick={() => {
                                                                            if (
                                                                                amountUpdatingId === row.id ||
                                                                                inlinePatchUpdatingId === row.id
                                                                            )
                                                                                return;
                                                                            setAmountEditingId(row.id);
                                                                            setAmountDraft(
                                                                                Math.abs(row.amount).toLocaleString('ru-RU', {
                                                                                    minimumFractionDigits: 2,
                                                                                    maximumFractionDigits: 2,
                                                                                }),
                                                                            );
                                                                        }}
                                                                        sx={{
                                                                            cursor:
                                                                                amountUpdatingId === row.id ? 'default' : 'pointer',
                                                                            display: 'inline-block',
                                                                        }}
                                                                    >
                                                                        {row.amount >= 0 ? '+' : ''}
                                                                        {formatAmount(row.amount)}
                                                                    </Box>
                                                                </Tooltip>
                                                            )}
                                                        </TableCell>
                                                        <TableCell sx={{ px: 0.25, verticalAlign: 'middle' }}>
                                                            <SourceRecipientSelect
                                                                value={(row.source ?? '') as SourceRecipientOptionValue}
                                                                onChange={(v) => void handleSourceChange(row, v)}
                                                                label={t('accountancy.source')}
                                                                counterparties={counterparties}
                                                                usersWithCashflow={usersWithCashflow}
                                                                hideLabel
                                                                popperMinWidth={240}
                                                                disabled={
                                                                    inlinePatchUpdatingId === row.id ||
                                                                    quantityUpdatingId === row.id ||
                                                                    reportMonthUpdatingId === row.id ||
                                                                    statusUpdatingId === row.id
                                                                }
                                                                sx={opTableSourceRecipientSx}
                                                            />
                                                        </TableCell>
                                                        <TableCell sx={{ px: 0.25, verticalAlign: 'middle' }}>
                                                            <SourceRecipientSelect
                                                                value={(row.recipient ?? '') as SourceRecipientOptionValue}
                                                                onChange={(v) => void handleRecipientChange(row, v)}
                                                                label={t('accountancy.recipient')}
                                                                counterparties={counterparties}
                                                                usersWithCashflow={usersWithCashflow}
                                                                cashflows={cashflows}
                                                                includeCashflows
                                                                hideLabel
                                                                popperMinWidth={240}
                                                                disabled={
                                                                    inlinePatchUpdatingId === row.id ||
                                                                    quantityUpdatingId === row.id ||
                                                                    reportMonthUpdatingId === row.id ||
                                                                    statusUpdatingId === row.id
                                                                }
                                                                sx={opTableSourceRecipientSx}
                                                            />
                                                        </TableCell>
                                                        <TableCell sx={{ px: 0.25 }}>
                                                            <Stack direction="row" alignItems="center" spacing={0}>
                                                                <Link
                                                                    href={
                                                                        row.type === 'expense'
                                                                            ? `/dashboard/accountancy/expense/edit/${row.entityId}`
                                                                            : `/dashboard/accountancy/income/edit/${row.entityId}`
                                                                    }
                                                                    aria-label={t('common.view')}
                                                                    style={{ display: 'inline-flex' }}
                                                                >
                                                                    <IconButton
                                                                        size="small"
                                                                        color="primary"
                                                                        component="span"
                                                                    >
                                                                        <Visibility fontSize="small" />
                                                                    </IconButton>
                                                                </Link>
                                                                <Tooltip
                                                                    title={
                                                                        row.type === 'expense'
                                                                            ? t('accountancy.deleteExpenseTitle')
                                                                            : t('accountancy.deleteIncomeTitle')
                                                                    }
                                                                >
                                                                    <span>
                                                                        <IconButton
                                                                            size="small"
                                                                            color="error"
                                                                            onClick={() => handleOperationDeleteClick(row)}
                                                                            disabled={operationDeletingId === row.id}
                                                                            aria-label={t('common.delete')}
                                                                        >
                                                                            <DeleteIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </span>
                                                                </Tooltip>
                                                            </Stack>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                        </TableContainer>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </Paper>
            </Stack>

            <Dialog open={deleteDialogOpen} onClose={handleOperationDeleteCancel}>
                <DialogTitle>
                    {operationToDelete?.type === 'expense'
                        ? t('accountancy.deleteExpenseTitle')
                        : t('accountancy.deleteIncomeTitle')}
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {operationToDelete?.type === 'expense'
                            ? t('accountancy.deleteExpenseMessage')
                            : t('accountancy.deleteIncomeMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleOperationDeleteCancel}>{t('common.cancel')}</Button>
                    <Button onClick={handleOperationDeleteConfirm} color="error" variant="contained">
                        {t('common.delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}


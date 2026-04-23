'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import {
    Visibility,
    Delete as DeleteIcon,
    ExpandMore as ExpandMoreIcon,
    Warning as WarningIcon,
} from "@mui/icons-material";
import { useUser } from "@/providers/UserProvider";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useTranslation } from "@/i18n/useTranslation";
import Link from 'next/link';
import { useObjects } from "@/providers/ObjectsProvider";
import { AccountancyCategory, Booking, Expense, Income } from "@/lib/types";
import { getExpenseSum, getIncomeSum } from "@/lib/accountancyUtils";
import { getExpenses, updateExpense, deleteExpense } from "@/lib/expenses";
import { getIncomes, updateIncome, deleteIncome } from "@/lib/incomes";
import { getBookingsByIds, searchBookings } from "@/lib/bookings";
import { getCounterparties } from "@/lib/counterparties";
import { getCashflows } from "@/lib/cashflows";
import { getUsersWithCashflow } from "@/lib/users";
import { getAccountancyCategories } from "@/lib/accountancyCategories";
import { buildCategoriesForSelect } from "@/lib/accountancyCategoryUtils";
import SourceRecipientSelect, {
    type SourceRecipientOptionValue,
} from "@/components/accountancy/SourceRecipientSelect";
import { AccountancyOverviewOperationTableRow, type AccountancyOverviewOperationRowModel } from "@/components/accountancy/AccountancyOverviewOperationTableRow";
import { getBookingRefererDisplay } from "@/lib/format";
import {
    NO_BOOKING_SUBGROUP_ORDER,
    resolveNoBookingSubgroupId,
} from "@/lib/noBookingCategorySubgroups";

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
 * Если задан интервал и набор отчётных месяцев (YYYY-MM) для него:
 * — при непустом «Месяце отчёта» запись попадает только если он входит в этот набор (дата операции не расширяет период);
 * — при пустом «Месяце отчёта» сохраняем отбор по календарной дате (старые проводки без поля).
 * Если период не задан (null), фильтр только по дате операции.
 */
function recordMatchesReportPeriod(
    date: Date | string | undefined,
    reportMonth: string | undefined | null,
    reportMonthsInFilter: Set<string> | null,
    isDateInRange: (d: Date | string | undefined) => boolean,
): boolean {
    if (reportMonthsInFilter === null) return isDateInRange(date);
    const rm = (reportMonth ?? '').trim();
    if (rm === '') return isDateInRange(date);
    return reportMonthsInFilter.has(rm);
}

/** Room/unit/booking id из API/Mongo может прийти строкой — иначе `===` с числовым room.id ломает строки сводки. */
function normalizeUnitOrRoomId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

/** Одна строка заголовка группы: id · статус · check-in · check-out · title · source · name · surname */
function formatBookingOperationsGroupLabel(bookingId: number, bookings: Booking[]): string {
    const dash = '—';
    const segText = (v: unknown) => {
        if (v === undefined || v === null) return dash;
        const s = String(v).trim();
        return s !== '' ? s : dash;
    };
    const segDate = (v: unknown) => {
        if (v === undefined || v === null || v === '') return dash;
        const d = new Date(v as string | Date);
        if (Number.isNaN(d.getTime())) return dash;
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };
    const segSource = (booking: Booking) => {
        const raw = [booking.refererEditable, booking.referer, booking.channel].find(
            (s) => s != null && String(s).trim() !== '',
        );
        if (raw == null) return dash;
        return getBookingRefererDisplay(String(raw).trim());
    };

    const idSeg = `#${bookingId}`;
    const b = bookings.find((x) => normalizeUnitOrRoomId(x.id) === bookingId);
    const statusSeg = b ? segText(b.status) : dash;

    if (!b) {
        return [idSeg, statusSeg, dash, dash, dash, dash, dash, dash].join(' · ');
    }
    return [
        idSeg,
        statusSeg,
        segDate(b.arrival),
        segDate(b.departure),
        segText(b.title),
        segSource(b),
        segText(b.firstName),
        segText(b.lastName),
    ].join(' · ');
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

type OperationRow = AccountancyOverviewOperationRowModel;

type OperationListGroup = {
    key: string;
    label: string;
    rows: OperationRow[];
    /** Бронь привязана к другой комнате, чем в фильтре (только для групп `b-*`) */
    bookingRoomMismatch?: boolean;
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
    /** Брони выбранного отчётного месяца по объекту (пересечение с периодом), для пустых групп в списке операций */
    const [monthBookingsForReportMonth, setMonthBookingsForReportMonth] = useState<Booking[]>([]);
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
    /** Ключи групп операций (включая `none`), свёрнутых в аккордеоне */
    const [collapsedOperationGroups, setCollapsedOperationGroups] = useState<Set<string>>(
        () => new Set(),
    );
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

    /** Эффективный период: выбранный месяц (YYYY-MM) или кастомные dateFrom/dateTo */
    const effectiveDateRange = useMemo(() => {
        if (selectedMonth) {
            const [y, m] = selectedMonth.split('-').map(Number);
            const from = new Date(y, m - 1, 1);
            const to = new Date(y, m, 0);
            return { from: localCalendarYmd(from), to: localCalendarYmd(to) };
        }
        return { from: dateFrom, to: dateTo };
    }, [selectedMonth, dateFrom, dateTo]);

    

    const totalExpenses = expenses.reduce((sum, e) => sum + getExpenseSum(e), 0);
    const totalIncomes = incomes.reduce((sum, i) => sum + getIncomeSum(i), 0);
    const balance = totalIncomes - totalExpenses;

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

    const selectedObject = selectedObjectId === 'all'
        ? null
        : objects.find((o) => o.id === selectedObjectId);

    useEffect(() => {
        if (!hasAccess || !selectedMonth || !selectedObject) {
            setMonthBookingsForReportMonth([]);
            return;
        }
        let cancelled = false;
        const propertyIdForSearch = selectedObject.propertyId ?? selectedObject.id;
        const rangeFrom = effectiveDateRange.from;
        const rangeTo = effectiveDateRange.to;
        if (!rangeFrom || !rangeTo) {
            setMonthBookingsForReportMonth([]);
            return;
        }
        (async () => {
            try {
                const list = await searchBookings({
                    objectId: propertyIdForSearch,
                    overlapFrom: rangeFrom,
                    overlapTo: rangeTo,
                });
                let next = list;
                if (selectedRoomId !== 'all') {
                    next = list.filter((b) => normalizeUnitOrRoomId(b.unitId) === selectedRoomId);
                }
                if (!cancelled) setMonthBookingsForReportMonth(next);
            } catch (e) {
                console.error('accountancy: month bookings load failed', e);
                if (!cancelled) setMonthBookingsForReportMonth([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        hasAccess,
        selectedMonth,
        selectedObject,
        selectedRoomId,
        effectiveDateRange.from,
        effectiveDateRange.to,
    ]);

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
                const bid = normalizeUnitOrRoomId(e.bookingId);
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
                    ...(bid != null ? { bookingId: bid } : {}),
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
                const bidInc = normalizeUnitOrRoomId(i.bookingId);
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
                    ...(bidInc != null ? { bookingId: bidInc } : {}),
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

    const bookingsMergedForLabels = useMemo(() => {
        const byId = new Map<number, Booking>();
        for (const b of bookings) {
            const id = normalizeUnitOrRoomId(b.id);
            if (id != null) byId.set(id, b);
        }
        for (const b of monthBookingsForReportMonth) {
            const id = normalizeUnitOrRoomId(b.id);
            if (id != null) byId.set(id, b);
        }
        return Array.from(byId.values());
    }, [bookings, monthBookingsForReportMonth]);

    const operationGroups = useMemo((): OperationListGroup[] => {
        const map = new Map<string, OperationRow[]>();
        for (const row of filteredOperations) {
            const bid = row.bookingId;
            const key = bid != null ? `b-${bid}` : 'none';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(row);
        }
        const noneRows = map.get('none') ?? [];
        map.delete('none');

        for (const [, gRows] of map) {
            gRows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }

        if (selectedMonth && monthBookingsForReportMonth.length > 0) {
            const keysWithRows = new Set(map.keys());
            for (const b of monthBookingsForReportMonth) {
                const bid = normalizeUnitOrRoomId(b.id);
                if (bid == null) continue;
                const key = `b-${bid}`;
                if (!keysWithRows.has(key)) {
                    map.set(key, []);
                    keysWithRows.add(key);
                }
            }
        }

        const bookingGroupSortTime = (key: string, gRows: OperationRow[]): number => {
            if (gRows.length) {
                return Math.max(...gRows.map((r) => new Date(r.date).getTime()));
            }
            const bid = Number(key.slice(2));
            const booking = bookingsMergedForLabels.find((x) => normalizeUnitOrRoomId(x.id) === bid);
            if (booking?.arrival) {
                const t = new Date(booking.arrival).getTime();
                return Number.isNaN(t) ? 0 : t;
            }
            return 0;
        };
        const bookingEntries = [...map.entries()].sort(
            (a, b) => bookingGroupSortTime(b[0], b[1]) - bookingGroupSortTime(a[0], a[1]),
        );
        const bookingRoomMismatchForKey = (bookingKey: string): boolean => {
            if (selectedRoomId === 'all' || !bookingKey.startsWith('b-')) return false;
            const bid = Number(bookingKey.slice(2));
            const b = bookingsMergedForLabels.find((x) => normalizeUnitOrRoomId(x.id) === bid);
            if (!b) return false;
            return normalizeUnitOrRoomId(b.unitId) !== selectedRoomId;
        };

        const bookingGroups: OperationListGroup[] = bookingEntries.map(([key, rows]) => ({
            key,
            label: formatBookingOperationsGroupLabel(Number(key.slice(2)), bookingsMergedForLabels),
            rows,
            bookingRoomMismatch: bookingRoomMismatchForKey(key),
        }));

        const bySub = new Map<string, OperationRow[]>();
        for (const sid of NO_BOOKING_SUBGROUP_ORDER) {
            bySub.set(sid, []);
        }
        for (const row of noneRows) {
            const sid = resolveNoBookingSubgroupId(row.category);
            bySub.get(sid)!.push(row);
        }
        for (const sid of NO_BOOKING_SUBGROUP_ORDER) {
            bySub.get(sid)!.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
        const noBookingGroups: OperationListGroup[] = NO_BOOKING_SUBGROUP_ORDER.map((sid) => ({
            key: `nobook-${sid}`,
            label: t(`accountancy.noBookingSubgroup.${sid}`),
            rows: bySub.get(sid)!,
        }));

        return [...bookingGroups, ...noBookingGroups];
    }, [
        filteredOperations,
        bookingsMergedForLabels,
        monthBookingsForReportMonth,
        selectedMonth,
        selectedRoomId,
        t,
    ]);

    const toggleOperationGroupCollapsed = (groupKey: string) => {
        setCollapsedOperationGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            return next;
        });
    };

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
                                const roomTypes = obj.roomTypes ?? [];
                                const isObjectExpanded = selectedObjectId === obj.id;
                                const isObjectRowSelected =
                                    selectedObjectId !== 'all' &&
                                    selectedObjectId === obj.id &&
                                    selectedRoomId === 'all';
                                return (
                                    <Fragment key={`${obj.propertyName || 'obj'}-${obj.id}`}>
                                        <TableRow
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
                                            <TableCell sx={{ py: 0.5, px: 1 }}>
                                                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                                                    {roomTypes.length > 0 ? (
                                                        <ExpandMoreIcon
                                                            fontSize="small"
                                                            sx={{
                                                                flexShrink: 0,
                                                                transform: isObjectExpanded
                                                                    ? 'rotate(0deg)'
                                                                    : 'rotate(-90deg)',
                                                                transition: (theme) =>
                                                                    theme.transitions.create('transform', {
                                                                        duration: theme.transitions.duration.shorter,
                                                                    }),
                                                            }}
                                                        />
                                                    ) : (
                                                        <Box sx={{ width: 24, flexShrink: 0 }} />
                                                    )}
                                                    <Typography
                                                        component="span"
                                                        variant="body2"
                                                        sx={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                    >
                                                        {obj.name}
                                                    </Typography>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                        {isObjectExpanded &&
                                            roomTypes.map((room) => {
                                                const isRoomRowSelected =
                                                    selectedObjectId === obj.id && selectedRoomId === room.id;
                                                const roomLabel = room.name || `Room ${room.id}`;
                                                return (
                                                    <TableRow
                                                        key={`room-${obj.id}-${room.id}`}
                                                        hover
                                                        selected={isRoomRowSelected}
                                                        onClick={() => {
                                                            setSelectedObjectId(obj.id);
                                                            setSelectedRoomId(room.id);
                                                        }}
                                                        sx={{
                                                            cursor: 'pointer',
                                                            '&.Mui-selected': {
                                                                bgcolor: 'action.selected',
                                                                '&:hover': { bgcolor: 'action.selected' },
                                                            },
                                                        }}
                                                    >
                                                        <TableCell
                                                            sx={{
                                                                py: 0.4,
                                                                pl: 3,
                                                                pr: 1,
                                                                borderLeft: 3,
                                                                borderColor: 'divider',
                                                            }}
                                                        >
                                                            <Typography
                                                                variant="body2"
                                                                sx={{ fontSize: '0.7rem', pl: 0.5, color: 'text.secondary' }}
                                                            >
                                                                {roomLabel}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                    </Fragment>
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
                                    {operationGroups.length === 0 ? (
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
                                                {operationGroups.map((group) => {
                                                    const collapsed = collapsedOperationGroups.has(group.key);
                                                    const groupIsEmpty = group.rows.length === 0;
                                                    const sharedOperationRowProps = {
                                                        t,
                                                        opTableSelectFormSx,
                                                        opTableCatSelectFormSx,
                                                        opTableQtySelectFormSx,
                                                        opTableSelectSx,
                                                        opTableInlineSelectSx,
                                                        opTableSourceRecipientSx,
                                                        OP_TABLE_COMMENT_COL_WIDTH_PX,
                                                        handleStatusToggle,
                                                        statusUpdatingId,
                                                        inlinePatchUpdatingId,
                                                        handleReportMonthChange,
                                                        reportMonthUpdatingId,
                                                        reportMonthOptions,
                                                        categoriesExpense,
                                                        categoriesIncome,
                                                        handleCategoryChange,
                                                        quantityUpdatingId,
                                                        commentDraftByRowId,
                                                        setCommentDraftByRowId,
                                                        handleCommentCommit,
                                                        quantityOptions,
                                                        handleQuantityChange,
                                                        amountEditingId,
                                                        amountDraft,
                                                        setAmountDraft,
                                                        setAmountEditingId,
                                                        amountEditEscapeRef,
                                                        handleOperationAmountCommit,
                                                        amountUpdatingId,
                                                        formatAmount,
                                                        handleSourceChange,
                                                        handleRecipientChange,
                                                        counterparties,
                                                        usersWithCashflow,
                                                        cashflows,
                                                        operationDeletingId,
                                                        handleOperationDeleteClick,
                                                    };
                                                    return (
                                                    <Fragment key={group.key}>
                                                        <TableRow
                                                            hover={!groupIsEmpty}
                                                            onClick={() => toggleOperationGroupCollapsed(group.key)}
                                                            sx={{
                                                                cursor: 'pointer',
                                                                ...(groupIsEmpty && {
                                                                    opacity: 0.65,
                                                                }),
                                                            }}
                                                            aria-expanded={!collapsed}
                                                            aria-disabled={groupIsEmpty}
                                                        >
                                                            <TableCell
                                                                colSpan={10}
                                                                sx={{
                                                                    py: 0.75,
                                                                    px: 1,
                                                                    lineHeight: 1.25,
                                                                    color: groupIsEmpty ? 'text.disabled' : undefined,
                                                                    bgcolor: (theme) => {
                                                                        if (groupIsEmpty) {
                                                                            return theme.palette.mode === 'light'
                                                                                ? 'rgba(0, 0, 0, 0.02)'
                                                                                : 'rgba(255, 255, 255, 0.03)';
                                                                        }
                                                                        return theme.palette.mode === 'light'
                                                                            ? 'rgba(0, 0, 0, 0.04)'
                                                                            : 'rgba(255, 255, 255, 0.06)';
                                                                    },
                                                                    borderBottom: 1,
                                                                    borderColor: 'divider',
                                                                }}
                                                            >
                                                                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                                                                    <ExpandMoreIcon
                                                                        fontSize="small"
                                                                        sx={{
                                                                            flexShrink: 0,
                                                                            color: groupIsEmpty ? 'action.disabled' : undefined,
                                                                            transform: collapsed
                                                                                ? 'rotate(-90deg)'
                                                                                : 'rotate(0deg)',
                                                                            transition: (theme) =>
                                                                                theme.transitions.create('transform', {
                                                                                    duration: theme.transitions.duration.shorter,
                                                                                }),
                                                                        }}
                                                                    />
                                                                    <Typography
                                                                        component="span"
                                                                        sx={{
                                                                            fontSize: '0.7rem',
                                                                            fontWeight: groupIsEmpty ? 500 : 600,
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                            whiteSpace: 'nowrap',
                                                                            minWidth: 0,
                                                                            color: 'inherit',
                                                                        }}
                                                                    >
                                                                        {group.label}
                                                                    </Typography>
                                                                    {group.bookingRoomMismatch ? (
                                                                        <Tooltip
                                                                            title={t('accountancy.bookingRoomFilterMismatch')}
                                                                            arrow
                                                                        >
                                                                            <WarningIcon
                                                                                fontSize="small"
                                                                                color="warning"
                                                                                sx={{ flexShrink: 0, ml: 0.25 }}
                                                                            />
                                                                        </Tooltip>
                                                                    ) : null}
                                                                </Stack>
                                                            </TableCell>
                                                        </TableRow>
                                                        {!collapsed &&
                                                            group.rows.map((row) => (
                                                                <AccountancyOverviewOperationTableRow
                                                                    key={row.id}
                                                                    row={row}
                                                                    {...sharedOperationRowProps}
                                                                />
                                                            ))}
                                                    </Fragment>
                                                    );
                                                })}
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


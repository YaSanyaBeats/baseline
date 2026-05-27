'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Box,
    Button,
    Typography,
    Alert,
    Stack,
    Paper,
    Chip,
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
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
} from "@mui/material";
import {
    Add as AddIcon,
    Warning as WarningIcon,
    ExpandMore as ExpandMoreIcon,
    Lock as LockIcon,
    LockOpen as LockOpenIcon,
} from "@mui/icons-material";
import { useUser } from "@/providers/UserProvider";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useTranslation } from "@/i18n/useTranslation";
import Link from 'next/link';
import { useObjects } from "@/providers/ObjectsProvider";
import {
    AccountancyCategory,
    Booking,
    Expense,
    Income,
    type BookingManagementCommissionRate,
} from "@/lib/types";
import { getExpenseSum, getIncomeSum, resolveAccountancyParentTransactionRef } from "@/lib/accountancyUtils";
import {
    closeReportMonth,
    getClosedReportMonths,
    reopenReportMonth,
} from "@/lib/accountancyClosedMonthsClient";
import { addExpense, getExpenses, updateExpense, deleteExpense } from "@/lib/expenses";
import { addIncome, getIncomes, updateIncome, deleteIncome } from "@/lib/incomes";
import { getBookingsByIds, searchBookings } from "@/lib/bookings";
import { getCounterparties } from "@/lib/counterparties";
import { getCashflows } from "@/lib/cashflows";
import { getUsersWithCashflow } from "@/lib/users";
import { getAccountancyCategories } from "@/lib/accountancyCategories";
import { buildCategoriesForSelect } from "@/lib/accountancyCategoryUtils";
import {
    buildCategoryNameByIdMap,
    buildAccountancyQuickAddCategoryContext,
    findCategoryById,
    mergeCategoryNameMaps,
    resolveCategoryFieldsFromId,
    resolveCategoryName,
    resolveCategorySourceRecipientValue,
    resolveCategoryTransactionDefaults,
} from "@/lib/accountancyCategoryResolve";
import {
    buildSourceRecipientAutocompleteOptions,
    type SourceRecipientOptionValue,
} from "@/components/accountancy/SourceRecipientSelect";
import { AccountancyOverviewOperationTableRow, type AccountancyOverviewOperationRowModel } from "@/components/accountancy/AccountancyOverviewOperationTableRow";
import { BookingGroupLineText } from "@/components/accountancy/BookingGroupLineText";
import { AccountancyObjectTreeTable } from "@/components/accountancy/AccountancyObjectTreeTable";
import { normalizeMongoIdString } from "@/lib/mongoId";
import { resolveAccountancyObjectRoomRowHighlight } from "@/lib/accountancyObjectRoomRowHighlight";
import {
    bookingBelongsToAccountancyObjectGroup,
    groupAccountancyObjectsByName,
    mergeRoomsForAccountancyObjectGroup,
    recordObjectMatchesAccountancySelection,
    stableAccountancyRoomLabel,
    getAccountancyObjectGroupMembers,
} from "@/lib/accountancyObjectGroups";
import {
    buildBookingGroupLineModel,
    joinBookingGroupSegments,
    type BookingGroupLineModel,
} from "@/lib/bookingGroupLine";
import {
    NO_BOOKING_SUBGROUP_ORDER,
    isExcludedFromAccountancyRoomStatsSum,
    resolveNoBookingSubgroupForTransaction,
} from "@/lib/noBookingCategorySubgroups";
import {
    BOOKING_GROUP_CATEGORY_ORDER,
    BOOKING_GROUP_MANAGEMENT_COMMISSION_AUTO_CATEGORY,
    HOLY_COW_EXPENSE_SHARE_AUTO_CATEGORY,
    getNoBookingSubgroupCategoryOrder,
    sortRowsByAccountancyCategoryOrder,
} from "@/lib/accountancyOperationGroupCategoryOrder";
import type { BookingCommissionResult, CommissionSchemeId, ManagementCommissionPercent } from "@/lib/commissionCalculation";
import {
    calculateBookingManagementCommission,
    getDefaultManagementCommissionPercent,
    getNightsCount,
    prepareCommissionData,
} from "@/lib/commissionCalculation";
import {
    getBookingManagementCommissionRates,
    saveBookingManagementCommissionRate,
} from "@/lib/bookingManagementCommissionRates";

const OVERVIEW_FILTERS_KEY = 'accountancy-overview-filters';

/** Ключ строки сводки: проводки без привязки к известной комнате объекта. */
const ACCOUNTANCY_UNALLOCATED_ROOM_KEY = '\u0000__unallocated__';

/** Legacy в localStorage: число unit id; после загрузки объектов превращаем в стабильное имя. */
function normalizeStoredRoomFilter(
    raw: unknown,
    rooms: { id: number; name?: string }[],
): string | 'all' {
    if (raw === 'all' || raw === null || raw === undefined || raw === '') return 'all';
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        const row = rooms.find((r) => r.id === raw);
        return row ? stableAccountancyRoomLabel(row) : 'all';
    }
    const s = String(raw);
    if (/^\d+$/.test(s)) {
        const row = rooms.find((r) => r.id === Number(s));
        return row ? stableAccountancyRoomLabel(row) : 'all';
    }
    return s;
}

/** YYYY-MM-DD по локальному календарю — границы периода и даты операций без сдвига UTC. */
function localCalendarYmd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ширина Select «Месяц отчёта» в таблице операций */
const OP_TABLE_SELECT_WIDTH_PX = 104;
/** Колонки «От кого» / «Кому» (Autocomplete) */
const OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX = 220;
/** Колонка действий (подтранзакция, просмотр, удаление) */
const OP_TABLE_ACTIONS_COL_WIDTH_PX = 88;
/** Ширина Select «Категория» (max-width текста в ячейке) */
const OP_TABLE_CAT_SELECT_WIDTH_PX = 260;
/** Колонка «Категория» */
const OP_TABLE_CATEGORY_COL_WIDTH_PX = 260;
/** Колонка «Количество»: только 1-2 цифры */
const OP_TABLE_QTY_COL_WIDTH_PX = 58;
/** Колонка «Комментарий» — только px: при table-layout:fixed + width:100% проценты ломали раскладку */
const OP_TABLE_COMMENT_COL_WIDTH_PX = 240;
/** Колонка «Делимость» (чекбокс + % комиссии для no-booking) */
const OP_TABLE_DIVISIBILITY_COL_WIDTH_PX = 80;
/** Минимальная ширина таблицы (сумма колонок), чтобы колонки не схлопывались до нуля */
const OP_TABLE_MIN_WIDTH_PX =
    44 +
    OP_TABLE_SELECT_WIDTH_PX +
    72 +
    OP_TABLE_CATEGORY_COL_WIDTH_PX +
    OP_TABLE_COMMENT_COL_WIDTH_PX +
    OP_TABLE_QTY_COL_WIDTH_PX +
    80 +
    OP_TABLE_DIVISIBILITY_COL_WIDTH_PX +
    OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX * 2 +
    OP_TABLE_ACTIONS_COL_WIDTH_PX;

const opTableSelectFormSx = {
    width: OP_TABLE_SELECT_WIDTH_PX,
    minWidth: OP_TABLE_SELECT_WIDTH_PX,
    maxWidth: OP_TABLE_SELECT_WIDTH_PX,
} as const;

const opTableCatSelectFormSx = {
    width: 'max-content',
    minWidth: 0,
    maxWidth: OP_TABLE_CAT_SELECT_WIDTH_PX,
    flex: '0 1 auto',
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
    width: 'max-content',
    maxWidth: '100%',
    bgcolor: 'transparent',
    boxShadow: 'none',
    '& .MuiOutlinedInput-root': {
        width: 'max-content',
        maxWidth: '100%',
    },
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
        pr: '0 !important',
        pl: 0,
        fontSize: '0.6875rem',
        lineHeight: 1.25,
        minHeight: 22,
        boxSizing: 'border-box',
        width: 'max-content',
        maxWidth: OP_TABLE_CAT_SELECT_WIDTH_PX,
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

function loadOverviewFilters() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(OVERVIEW_FILTERS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            selectedObjectId: parseOverviewObjectId(parsed.selectedObjectId),
            selectedRoomIdRaw: parsed.selectedRoomId,
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
    selectedRoomId: string | 'all';
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

function resolveApiErrorMessage(error: unknown, fallback: string): string {
    const apiMessage = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
    if (typeof apiMessage === 'string' && apiMessage.trim() !== '') return apiMessage;
    if (error instanceof Error && error.message.trim() !== '') return error.message;
    return fallback;
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

/** Месяц YYYY-MM для накопления «остатка на начало»: отчётный месяц, иначе календарный по дате операции. */
function ledgerMonthFromRecord(date: Date | string | undefined, reportMonth: string | undefined | null): string | null {
    const rm = (reportMonth ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(rm)) return rm;
    if (!date) return null;
    const parsed = new Date(date as string | Date);
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

/** Room/unit/booking id из API/Mongo может прийти строкой — иначе `===` с числовым room.id ломает строки сводки. */
function normalizeUnitOrRoomId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function buildBookingGroupLine(
    bookingId: number,
    bookings: Booking[],
): { label: string; bookingGroupLine: BookingGroupLineModel | undefined } {
    const b = bookings.find((x) => normalizeUnitOrRoomId(x.id) === bookingId);
    if (!b) {
        return {
            label: '',
            bookingGroupLine: undefined,
        };
    }
    const bookingGroupLine = buildBookingGroupLineModel(b);
    return {
        label: joinBookingGroupSegments(bookingGroupLine.segments),
        bookingGroupLine,
    };
}

type OperationRow = AccountancyOverviewOperationRowModel;

type OperationListGroup = {
    key: string;
    label: string;
    rows: OperationRow[];
    /** Бронь привязана к другой комнате, чем в фильтре (только для групп `b-*`) */
    bookingRoomMismatch?: boolean;
    /** Название комнаты брони, только для групп `b-*` */
    bookingUnitRoomName?: string | null;
    /** Сегменты заголовка и полный комментарий (Tooltip) — только для групп `b-*` с известной бронью. */
    bookingGroupLine?: BookingGroupLineModel;
};

/** Группа «Общие расходы» без брони — чекбокс «Делимость» у расходов и приходов. «Расходы гостя» — без делимости. */
const DIVISIBILITY_NOBOOK_GROUP_KEYS = new Set(['nobook-common']);

function operationRowShowsDivisibilityCheckbox(groupKey: string, row: OperationRow): boolean {
    if (row.readOnlySynthetic) return false;
    if (groupKey.startsWith('b-')) return row.type === 'expense';
    return DIVISIBILITY_NOBOOK_GROUP_KEYS.has(groupKey);
}

function operationRowShowsCommissionPercentSelect(groupKey: string, row: OperationRow): boolean {
    if (row.readOnlySynthetic) return false;
    if (row.bookingId != null) return false;
    return DIVISIBILITY_NOBOOK_GROUP_KEYS.has(groupKey) && row.includeInSynthetic !== false;
}

/** Локальный черновик новой транзакции в таблице сводки (до сохранения в БД). */
type PendingOperationDraft = {
    clientId: string;
    type: 'expense' | 'income';
    status: 'draft' | 'confirmed';
    date: Date;
    categoryId: string;
    category: string;
    comment: string;
    quantity: number;
    unitAmount: number;
    reportMonth: string;
    source?: string;
    recipient?: string;
};

function pendingDraftRowId(clientId: string): string {
    return `pending-${clientId}`;
}

function pendingClientIdFromRowId(rowId: string): string | null {
    if (!rowId.startsWith('pending-')) return null;
    return rowId.slice('pending-'.length);
}

function pendingDraftToOperationRow(draft: PendingOperationDraft): OperationRow {
    const total = draft.unitAmount * draft.quantity;
    return {
        id: pendingDraftRowId(draft.clientId),
        isPendingDraft: true,
        type: draft.type,
        entityId: '',
        status: draft.status,
        date: draft.date,
        categoryId: draft.categoryId,
        category: draft.category,
        comment: draft.comment,
        quantity: draft.quantity,
        amount: draft.type === 'expense' ? -total : total,
        reportMonth: draft.reportMonth,
        source: draft.source,
        recipient: draft.recipient,
    };
}

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const { objects } = useObjects();

    const formatAmount = useCallback((value: number): string => {
        return value.toLocaleString('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }, []);

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    /** Брони отчётного месяца по всем объектам (пересечение с периодом) — подсветка дерева и merge в labels */
    const [allMonthBookingsInPeriod, setAllMonthBookingsInPeriod] = useState<Booking[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [usersWithCashflow, setUsersWithCashflow] = useState<{ _id: string; name: string }[]>([]);
    const [cashflows, setCashflows] = useState<{ _id: string; name: string }[]>([]);
    const [categoriesExpense, setCategoriesExpense] = useState<AccountancyCategory[]>([]);
    const [categoriesIncome, setCategoriesIncome] = useState<AccountancyCategory[]>([]);
    const categoryNameById = useMemo(
        () =>
            mergeCategoryNameMaps(
                buildCategoryNameByIdMap(categoriesExpense),
                buildCategoryNameByIdMap(categoriesIncome),
            ),
        [categoriesExpense, categoriesIncome],
    );
    const allCategories = useMemo(
        () => [...categoriesExpense, ...categoriesIncome],
        [categoriesExpense, categoriesIncome],
    );
    const [referenceLoading, setReferenceLoading] = useState(true);
    const [transactionsLoading, setTransactionsLoading] = useState(false);

    const overviewFiltersLoadedRef = useRef(false);

    const [filtersHydrated, setFiltersHydrated] = useState(false);
    const [selectedObjectId, setSelectedObjectId] = useState<number | 'all'>('all');
    const [selectedRoomId, setSelectedRoomId] = useState<string | 'all'>('all');
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
    const [commissionRatesByBookingId, setCommissionRatesByBookingId] = useState<Record<number, BookingManagementCommissionRate>>({});
    const [commissionPercentUpdatingBookingId, setCommissionPercentUpdatingBookingId] = useState<number | null>(null);
    const [includeInSyntheticUpdatingId, setIncludeInSyntheticUpdatingId] = useState<string | null>(null);
    const [commissionPercentUpdatingId, setCommissionPercentUpdatingId] = useState<string | null>(null);
    const [commentDraftByRowId, setCommentDraftByRowId] = useState<Record<string, string>>({});
    const [operationToDelete, setOperationToDelete] = useState<OperationRow | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [operationDeletingId, setOperationDeletingId] = useState<string | null>(null);
    /** Ключи групп операций (включая `none`), свёрнутых в аккордеоне */
    const [collapsedOperationGroups, setCollapsedOperationGroups] = useState<Set<string>>(
        () => new Set(),
    );
    const [pendingDrafts, setPendingDrafts] = useState<PendingOperationDraft[]>([]);
    const [pendingDraftSavingId, setPendingDraftSavingId] = useState<string | null>(null);
    const [closedReportMonths, setClosedReportMonths] = useState<Set<string>>(new Set());
    const [periodLockDialog, setPeriodLockDialog] = useState<'close' | 'reopen' | null>(null);
    const [periodLockLoading, setPeriodLockLoading] = useState(false);
    useEffect(() => {
        if (overviewFiltersLoadedRef.current) return;
        const s = loadOverviewFilters();
        if (!s) {
            overviewFiltersLoadedRef.current = true;
            setFiltersHydrated(true);
            return;
        }
        if (objects.length === 0) return;

        setSelectedObjectId(s.selectedObjectId);
        setDateFrom(s.dateFrom);
        setDateTo(s.dateTo);
        setSelectedMonth(s.selectedMonth);
        const obj = s.selectedObjectId !== 'all' ? objects.find((o) => o.id === s.selectedObjectId) : null;
        const rooms = obj?.roomTypes ?? [];
        setSelectedRoomId(normalizeStoredRoomFilter(s.selectedRoomIdRaw, rooms));
        overviewFiltersLoadedRef.current = true;
        setFiltersHydrated(true);
    }, [objects]);

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

    useEffect(() => {
        setPendingDrafts([]);
    }, [selectedObjectId, selectedRoomId]);

    const { hasAccess } = useMemo(() => {
        const hasAccess = isAdmin || isAccountant;
        return { hasAccess };
    }, [isAdmin, isAccountant]);

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

    useEffect(() => {
        if (!hasAccess) {
            setReferenceLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const [cps, cfs, usersCf, catExp, catInc, closedMonths] = await Promise.all([
                    getCounterparties(),
                    getCashflows(),
                    getUsersWithCashflow(),
                    getAccountancyCategories('expense'),
                    getAccountancyCategories('income'),
                    getClosedReportMonths(),
                ]);
                if (cancelled) return;
                setCategoriesExpense(catExp);
                setCategoriesIncome(catInc);
                setClosedReportMonths(new Set(closedMonths));
                setCounterparties(cps.map((c) => ({ _id: normalizeMongoIdString(c._id), name: c.name })));
                setCashflows(cfs.map((c) => ({ _id: c._id!, name: c.name })));
                setUsersWithCashflow(usersCf);
            } finally {
                if (!cancelled) setReferenceLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [hasAccess]);

    useEffect(() => {
        if (!hasAccess || !filtersHydrated) return;

        if (objects.length === 0) {
            setExpenses([]);
            setIncomes([]);
            setBookings([]);
            setTransactionsLoading(false);
            return;
        }

        const objectIdsForApi = Array.from(new Set(objects.map((o) => o.id)));

        const hasAnyPeriod =
            Boolean(selectedMonth) || Boolean(effectiveDateRange.from) || Boolean(effectiveDateRange.to);
        const listQuery = {
            objectIds: objectIdsForApi,
            ...(hasAnyPeriod
                ? {
                      dateFrom: '2000-01-01',
                      dateTo: effectiveDateRange.to || localCalendarYmd(new Date()),
                  }
                : {
                      ...(effectiveDateRange.from ? { dateFrom: effectiveDateRange.from } : {}),
                      ...(effectiveDateRange.to ? { dateTo: effectiveDateRange.to } : {}),
                  }),
        };

        let cancelled = false;
        setTransactionsLoading(true);
        (async () => {
            try {
                const [exp, inc] = await Promise.all([getExpenses(listQuery), getIncomes(listQuery)]);
                if (cancelled) return;
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
                    if (!cancelled) setBookings(bookingsList);
                } else if (!cancelled) {
                    setBookings([]);
                }
            } catch (e) {
                console.error('accountancy overview: transactions load failed', e);
                if (!cancelled) {
                    setExpenses([]);
                    setIncomes([]);
                    setBookings([]);
                }
            } finally {
                if (!cancelled) setTransactionsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [hasAccess, filtersHydrated, objects, effectiveDateRange.from, effectiveDateRange.to, selectedMonth]);

    const loading = !filtersHydrated || referenceLoading || transactionsLoading;


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

    /** Один календарный месяц YYYY-MM для авто-комиссии (как на странице «Комиссия»): выбранный месяц или ровно один месяц в периоде. */
    const commissionCalculationMonthKey = useMemo(() => {
        const m = (selectedMonth ?? '').trim();
        if (/^\d{4}-\d{2}$/.test(m)) return m;
        if (reportMonthsInFilter != null && reportMonthsInFilter.size === 1) {
            return [...reportMonthsInFilter][0]!;
        }
        return null;
    }, [selectedMonth, reportMonthsInFilter]);

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

    const accountancyObjectGroups = useMemo(
        () => groupAccountancyObjectsByName(objects),
        [objects],
    );

    const selectedObjectGroupMembers = useMemo(() => {
        if (!selectedObject) return [];
        return getAccountancyObjectGroupMembers(objects, selectedObject.id);
    }, [selectedObject, objects]);

    useEffect(() => {
        if (!hasAccess || !selectedMonth) {
            setAllMonthBookingsInPeriod([]);
            return;
        }
        const rangeFrom = effectiveDateRange.from;
        const rangeTo = effectiveDateRange.to;
        if (!rangeFrom || !rangeTo) {
            setAllMonthBookingsInPeriod([]);
            return;
        }
        const uniquePropertyIds = Array.from(new Set(objects.map((o) => o.propertyId ?? o.id)));
        if (uniquePropertyIds.length === 0) {
            setAllMonthBookingsInPeriod([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const list = await searchBookings({
                    objectIds: uniquePropertyIds,
                    overlapFrom: rangeFrom,
                    overlapTo: rangeTo,
                });
                if (cancelled) return;
                const seen = new Set<number>();
                const merged: Booking[] = [];
                for (const b of list) {
                    const id = normalizeUnitOrRoomId(b.id);
                    if (id == null || seen.has(id)) continue;
                    seen.add(id);
                    merged.push(b);
                }
                setAllMonthBookingsInPeriod(merged);
            } catch (e) {
                console.error('accountancy: month bookings load failed', e);
                if (!cancelled) setAllMonthBookingsInPeriod([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [hasAccess, selectedMonth, objects, effectiveDateRange.from, effectiveDateRange.to]);

    const roomsForSelectedObject = useMemo(
        () =>
            selectedObjectGroupMembers.length > 0
                ? mergeRoomsForAccountancyObjectGroup(selectedObjectGroupMembers)
                : [],
        [selectedObjectGroupMembers],
    );

    const selectedRoomRow = useMemo(
        () =>
            selectedRoomId === 'all'
                ? null
                : roomsForSelectedObject.find((r) => stableAccountancyRoomLabel(r) === selectedRoomId) ?? null,
        [roomsForSelectedObject, selectedRoomId],
    );

    /** Брони месяца только для выбранного в сводке объекта (и комнаты), для списка операций */
    const monthBookingsForReportMonth = useMemo(() => {
        if (selectedObjectId === 'all' || !selectedObject) return [];
        let list = allMonthBookingsInPeriod.filter((booking) =>
            bookingBelongsToAccountancyObjectGroup(booking, selectedObjectGroupMembers),
        );
        if (selectedRoomId !== 'all') {
            const roomRow = roomsForSelectedObject.find(
                (r) => stableAccountancyRoomLabel(r) === selectedRoomId,
            );
            if (roomRow) {
                list = list.filter((b) => normalizeUnitOrRoomId(b.unitId) === roomRow.id);
            } else {
                list = [];
            }
        }
        return list;
    }, [
        allMonthBookingsInPeriod,
        selectedObjectId,
        selectedObject,
        selectedObjectGroupMembers,
        selectedRoomId,
        roomsForSelectedObject,
    ]);

    const filteredRoomStats = useMemo(() => {
        if (!selectedObject) return [];

        const bookingBelongsToObject = (booking: Booking) =>
            bookingBelongsToAccountancyObjectGroup(booking, selectedObjectGroupMembers);

        /**
         * Имя юнита для строки сводки (стабильная метка):
         * 1) roomName из проводки, если есть в справочнике комнат объекта;
         * 2) иначе unitId брони Beds24 → имя из справочника;
         * 3) иначе сырой roomName проводки (запасной якорь).
         */
        const nameSet = new Set(roomsForSelectedObject.map((r) => stableAccountancyRoomLabel(r)));

        const resolveRecordRoomName = (
            recordObjectId: number,
            recordRoomName?: string | null,
            bookingId?: number,
        ): string | null => {
            if (!recordObjectMatchesAccountancySelection(recordObjectId, selectedObject, objects)) return null;

            const ridExplicit = (recordRoomName ?? '').trim();
            if (ridExplicit && nameSet.has(ridExplicit)) {
                return ridExplicit;
            }

            const bid = normalizeUnitOrRoomId(bookingId);
            if (bid != null) {
                const booking = bookings.find((b) => normalizeUnitOrRoomId(b.id) === bid);
                if (booking && bookingBelongsToObject(booking)) {
                    const uid = normalizeUnitOrRoomId(booking.unitId);
                    if (uid != null) {
                        const matchRoom = roomsForSelectedObject.find((r) => r.id === uid);
                        if (matchRoom) {
                            const un = stableAccountancyRoomLabel(matchRoom);
                            if (nameSet.has(un)) return un;
                        }
                    }
                }
            }

            if (ridExplicit) return ridExplicit;
            return null;
        };

        const expenseRoomName = (e: Expense) =>
            resolveRecordRoomName(e.objectId, e.roomName, e.bookingId);

        const incomeRoomName = (i: Income) =>
            resolveRecordRoomName(i.objectId, i.roomName, i.bookingId);

        type MonthRoomAgg = Map<string, Map<string, { exp: number; inc: number }>>;
        const monthRoomAgg: MonthRoomAgg = new Map();

        const bumpAgg = (month: string, roomKey: string, kind: 'exp' | 'inc', amount: number) => {
            if (!monthRoomAgg.has(month)) monthRoomAgg.set(month, new Map());
            const rm = monthRoomAgg.get(month)!;
            const cur = rm.get(roomKey) ?? { exp: 0, inc: 0 };
            cur[kind] += amount;
            rm.set(roomKey, cur);
        };

        for (const e of expenses) {
            if (!recordObjectMatchesAccountancySelection(e.objectId, selectedObject, objects)) continue;
            const lm = ledgerMonthFromRecord(e.date, e.reportMonth);
            if (!lm) continue;
            if (isExcludedFromAccountancyRoomStatsSum(resolveCategoryName(e, categoryNameById), lm)) continue;
            const rid = expenseRoomName(e);
            const key = rid === null ? ACCOUNTANCY_UNALLOCATED_ROOM_KEY : rid;
            bumpAgg(lm, key, 'exp', getExpenseSum(e));
        }
        for (const i of incomes) {
            if (!recordObjectMatchesAccountancySelection(i.objectId, selectedObject, objects)) continue;
            const lm = ledgerMonthFromRecord(i.date, i.reportMonth);
            if (!lm) continue;
            if (isExcludedFromAccountancyRoomStatsSum(resolveCategoryName(i, categoryNameById), lm)) continue;
            const rid = incomeRoomName(i);
            const key = rid === null ? ACCOUNTANCY_UNALLOCATED_ROOM_KEY : rid;
            bumpAgg(lm, key, 'inc', getIncomeSum(i));
        }

        let openingByRoom = new Map<string, number>();
        if (reportMonthsInFilter !== null && reportMonthsInFilter.size > 0) {
            const firstPeriodMonth = Array.from(reportMonthsInFilter).sort()[0];
            const running = new Map<string, number>();
            for (const m of Array.from(monthRoomAgg.keys()).sort()) {
                if (m >= firstPeriodMonth) break;
                const roomMap = monthRoomAgg.get(m)!;
                for (const [roomKey, v] of roomMap) {
                    running.set(roomKey, (running.get(roomKey) ?? 0) + v.inc - v.exp);
                }
            }
            openingByRoom = running;
        }

        const roomRows = roomsForSelectedObject.map((room) => {
            const roomKey = stableAccountancyRoomLabel(room);
            let expSum = 0;
            let incSum = 0;
            filteredByReportPeriod.expenses.forEach((e) => {
                const lm = ledgerMonthFromRecord(e.date, e.reportMonth);
                if (isExcludedFromAccountancyRoomStatsSum(resolveCategoryName(e, categoryNameById), lm)) return;
                if (expenseRoomName(e) === roomKey) expSum += getExpenseSum(e);
            });
            filteredByReportPeriod.incomes.forEach((i) => {
                const lm = ledgerMonthFromRecord(i.date, i.reportMonth);
                if (isExcludedFromAccountancyRoomStatsSum(resolveCategoryName(i, categoryNameById), lm)) return;
                if (incomeRoomName(i) === roomKey) incSum += getIncomeSum(i);
            });
            return {
                roomKey,
                roomName: room.name || `Room ${room.id}`,
                expenses: expSum,
                incomes: incSum,
                openingBalance: openingByRoom.get(roomKey) ?? 0,
            };
        });

        let orphanExp = 0;
        let orphanInc = 0;
        filteredByReportPeriod.expenses.forEach((e) => {
            if (!recordObjectMatchesAccountancySelection(e.objectId, selectedObject, objects)) return;
            const lmExp = ledgerMonthFromRecord(e.date, e.reportMonth);
            if (isExcludedFromAccountancyRoomStatsSum(resolveCategoryName(e, categoryNameById), lmExp)) return;
            if (expenseRoomName(e) === null) orphanExp += getExpenseSum(e);
        });
        filteredByReportPeriod.incomes.forEach((i) => {
            if (!recordObjectMatchesAccountancySelection(i.objectId, selectedObject, objects)) return;
            const lmInc = ledgerMonthFromRecord(i.date, i.reportMonth);
            if (isExcludedFromAccountancyRoomStatsSum(resolveCategoryName(i, categoryNameById), lmInc)) return;
            if (incomeRoomName(i) === null) orphanInc += getIncomeSum(i);
        });

        const orphanOpening = openingByRoom.get(ACCOUNTANCY_UNALLOCATED_ROOM_KEY) ?? 0;
        const showUnallocatedRow =
            selectedRoomId === 'all' &&
            (orphanExp > 0 || orphanInc > 0 || orphanOpening !== 0);

        const rows: Array<{
            roomKey: string;
            roomName: string;
            expenses: number;
            incomes: number;
            openingBalance: number;
        }> = showUnallocatedRow
            ? [
                  ...roomRows,
                  {
                      roomKey: ACCOUNTANCY_UNALLOCATED_ROOM_KEY,
                      roomName: t('accountancy.unallocatedRoomStats'),
                      expenses: orphanExp,
                      incomes: orphanInc,
                      openingBalance: orphanOpening,
                  },
              ]
            : roomRows;

        return selectedRoomId === 'all' ? rows : rows.filter((row) => row.roomKey === selectedRoomId);
    }, [
        selectedObject,
        selectedObjectGroupMembers,
        roomsForSelectedObject,
        filteredByReportPeriod,
        bookings,
        selectedRoomId,
        t,
        objects,
        expenses,
        incomes,
        reportMonthsInFilter,
        categoryNameById,
    ]);

    const getAccountancyObjectRoomRowHighlight = useMemo(() => {
        return (objectId: number, roomName: string) => {
            const objectRow = objects.find((o) => o.id === objectId);
            if (!objectRow) return 'default' as const;
            const monthForObject = allMonthBookingsInPeriod.filter((b) => {
                const bp = b.propertyId;
                if (bp === undefined || bp === null) return true;
                return bp === objectRow.propertyId || bp === objectRow.id;
            });
            return resolveAccountancyObjectRoomRowHighlight({
                objectRow,
                roomName,
                allObjects: objects,
                selectedMonth,
                bookings,
                monthBookingsInPeriod: monthForObject,
                expenses: filteredByReportPeriod.expenses,
                incomes: filteredByReportPeriod.incomes,
            });
        };
    }, [
        objects,
        selectedMonth,
        bookings,
        allMonthBookingsInPeriod,
        filteredByReportPeriod.expenses,
        filteredByReportPeriod.incomes,
    ]);

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

    const categorySelectItemsExpense = useMemo(
        () => buildCategoriesForSelect(categoriesExpense, 'expense'),
        [categoriesExpense],
    );
    const categorySelectItemsIncome = useMemo(
        () => buildCategoriesForSelect(categoriesIncome, 'income'),
        [categoriesIncome],
    );

    const sourceRecipientOptionsTable = useMemo(
        () =>
            buildSourceRecipientAutocompleteOptions({
                objects,
                counterparties,
                usersWithCashflow,
                cashflows,
                includeCashflows: false,
                includeBookingRoomOption: false,
                t,
            }),
        [objects, counterparties, usersWithCashflow, cashflows, t],
    );

    const recipientRecipientOptionsTable = useMemo(
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

    const filteredOperations = useMemo((): OperationRow[] => {
        if (selectedObjectId === 'all' || !selectedObject) return [];

        const bookingBelongsToObject = (booking: Booking) =>
            bookingBelongsToAccountancyObjectGroup(booking, selectedObjectGroupMembers);
        const nameSet = new Set(roomsForSelectedObject.map((r) => stableAccountancyRoomLabel(r)));

        const resolveRecordRoomName = (
            recordObjectId: number,
            recordRoomName?: string | null,
            bookingId?: number,
        ): string | null => {
            if (!recordObjectMatchesAccountancySelection(recordObjectId, selectedObject, objects)) return null;

            const ridExplicit = (recordRoomName ?? '').trim();
            if (ridExplicit && nameSet.has(ridExplicit)) {
                return ridExplicit;
            }

            const bid = normalizeUnitOrRoomId(bookingId);
            if (bid != null) {
                const booking = bookings.find((b) => normalizeUnitOrRoomId(b.id) === bid);
                if (booking && bookingBelongsToObject(booking)) {
                    const uid = normalizeUnitOrRoomId(booking.unitId);
                    if (uid != null) {
                        const matchRoomRow = roomsForSelectedObject.find((r) => r.id === uid);
                        if (matchRoomRow) {
                            const un = stableAccountancyRoomLabel(matchRoomRow);
                            if (nameSet.has(un)) return un;
                        }
                    }
                }
            }

            if (ridExplicit) return ridExplicit;
            return null;
        };

        const matchRoom = (
            recordObjectId: number,
            roomName: string | null | undefined,
            bookingId?: number,
        ) => {
            if (selectedRoomId === 'all') return true;
            return resolveRecordRoomName(recordObjectId, roomName, bookingId) === selectedRoomId;
        };

        const rows: OperationRow[] = [];

        const transactionById = new Map<
            string,
            { type: 'expense' | 'income'; record: Expense | Income }
        >();
        for (const e of expenses) {
            const id = e._id != null ? normalizeMongoIdString(e._id) : '';
            if (id) transactionById.set(id, { type: 'expense', record: e });
        }
        for (const i of incomes) {
            const id = i._id != null ? normalizeMongoIdString(i._id) : '';
            if (id) transactionById.set(id, { type: 'income', record: i });
        }

        const expenseTypeLabel = t('accountancy.expense');
        const incomeTypeLabel = t('accountancy.income');

        expenses
            .filter(
                (e) =>
                    recordObjectMatchesAccountancySelection(e.objectId, selectedObject, objects) &&
                    matchRoom(e.objectId, e.roomName ?? null, e.bookingId) &&
                    recordMatchesReportPeriod(e.date, e.reportMonth, reportMonthsInFilter, isDateInRange),
            )
            .forEach((e) => {
                const bid = normalizeUnitOrRoomId(e.bookingId);
                const parentTransaction = resolveAccountancyParentTransactionRef(
                    e,
                    transactionById,
                    expenseTypeLabel,
                    incomeTypeLabel,
                    categoryNameById,
                );
                rows.push({
                    id: `exp-${e._id ?? ''}`,
                    type: 'expense',
                    entityId: e._id ?? '',
                    status: e.status,
                    date: e.date,
                    categoryId: e.categoryId ?? '',
                    category: resolveCategoryName(e, categoryNameById),
                    comment: e.comment ?? '',
                    quantity: e.quantity ?? 1,
                    amount: -getExpenseSum(e),
                    reportMonth: e.reportMonth ?? '',
                    source: e.source,
                    recipient: e.recipient,
                    autoCreated: !!(e as Expense & { autoCreated?: unknown }).autoCreated,
                    includeInSynthetic: e.includeInSynthetic,
                    commissionPercent: e.commissionPercent ?? 30,
                    ...(parentTransaction ? { parentTransaction } : {}),
                    ...(bid != null ? { bookingId: bid } : {}),
                });
            });

        incomes
            .filter(
                (i) =>
                    recordObjectMatchesAccountancySelection(i.objectId, selectedObject, objects) &&
                    matchRoom(i.objectId, i.roomName ?? null, i.bookingId) &&
                    recordMatchesReportPeriod(i.date, i.reportMonth, reportMonthsInFilter, isDateInRange),
            )
            .forEach((i) => {
                const bidInc = normalizeUnitOrRoomId(i.bookingId);
                const parentTransaction = resolveAccountancyParentTransactionRef(
                    i,
                    transactionById,
                    expenseTypeLabel,
                    incomeTypeLabel,
                    categoryNameById,
                );
                rows.push({
                    id: `inc-${i._id ?? ''}`,
                    type: 'income',
                    entityId: i._id ?? '',
                    status: (i as any).status ?? 'draft',
                    date: i.date,
                    categoryId: i.categoryId ?? '',
                    category: resolveCategoryName(i, categoryNameById),
                    comment: i.comment ?? '',
                    quantity: i.quantity ?? 1,
                    amount: getIncomeSum(i),
                    reportMonth: i.reportMonth ?? '',
                    source: i.source,
                    recipient: i.recipient,
                    autoCreated: !!(i as Income & { autoCreated?: unknown }).autoCreated,
                    includeInSynthetic: i.includeInSynthetic,
                    commissionPercent: i.commissionPercent ?? 30,
                    ...(parentTransaction ? { parentTransaction } : {}),
                    ...(bidInc != null ? { bookingId: bidInc } : {}),
                });
            });

        rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return rows;
    }, [
        selectedObjectId,
        selectedObject,
        selectedObjectGroupMembers,
        selectedRoomId,
        expenses,
        incomes,
        bookings,
        isDateInRange,
        reportMonthsInFilter,
        objects,
        roomsForSelectedObject,
        t,
        categoryNameById,
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

    const bookingIdsForCommissionRates = useMemo(
        () =>
            Array.from(
                new Set(
                    bookingsMergedForLabels
                        .map((b) => normalizeUnitOrRoomId(b.id))
                        .filter((id): id is number => id != null),
                ),
            ),
        [bookingsMergedForLabels],
    );

    useEffect(() => {
        if (!hasAccess || bookingIdsForCommissionRates.length === 0) {
            setCommissionRatesByBookingId({});
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const rates = await getBookingManagementCommissionRates(bookingIdsForCommissionRates);
                if (cancelled) return;
                setCommissionRatesByBookingId(
                    Object.fromEntries(rates.map((rate) => [rate.bookingId, rate])),
                );
            } catch (e) {
                console.error('accountancy: commission rates load failed', e);
                if (!cancelled) setCommissionRatesByBookingId({});
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [hasAccess, bookingIdsForCommissionRates]);

    const DEFAULT_COMMISSION_SCHEME_ID: CommissionSchemeId = 2;

    const bookingAutoCommissionByBookingId = useMemo(() => {
        const map = new Map<number, BookingCommissionResult>();
        if (!selectedObject || !commissionCalculationMonthKey) return map;
        const bookingPropertyId = selectedObject.propertyId ?? selectedObject.id;
        const roomFilter: string | 'all' = selectedRoomId === 'all' ? 'all' : selectedRoomId;
        const inputs = prepareCommissionData(
            bookingsMergedForLabels,
            incomes,
            expenses,
            categoriesExpense,
            selectedObject.id,
            roomFilter,
            commissionCalculationMonthKey,
            bookingPropertyId,
            roomsForSelectedObject,
        );
        const getSchemeForBooking = (booking: Booking): CommissionSchemeId => {
            const room = roomsForSelectedObject.find((r) => r.id === booking.unitId);
            const scheme = room?.commissionSchemeId;
            return scheme != null && scheme >= 1 && scheme <= 4
                ? (scheme as CommissionSchemeId)
                : DEFAULT_COMMISSION_SCHEME_ID;
        };
        for (const input of inputs) {
            const percentOverride = commissionRatesByBookingId[input.booking.id]?.percent;
            const r = calculateBookingManagementCommission(input, getSchemeForBooking(input.booking), percentOverride);
            map.set(input.booking.id, r);
        }
        return map;
    }, [
        selectedObject,
        commissionCalculationMonthKey,
        bookingsMergedForLabels,
        incomes,
        expenses,
        categoriesExpense,
        selectedRoomId,
        roomsForSelectedObject,
        commissionRatesByBookingId,
    ]);

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
            sortRowsByAccountancyCategoryOrder(gRows, BOOKING_GROUP_CATEGORY_ORDER);
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
        const bookingEntries = [...map.entries()]
            .filter(([, gRows]) => gRows.some((r) => !r.readOnlySynthetic))
            .sort((a, b) => bookingGroupSortTime(b[0], b[1]) - bookingGroupSortTime(a[0], a[1]));
        const resolveBookingUnitRoomName = (unitId: unknown): string | null => {
            const uid = normalizeUnitOrRoomId(unitId);
            if (uid == null) return null;
            const roomRow = roomsForSelectedObject.find((r) => r.id === uid);
            return roomRow ? stableAccountancyRoomLabel(roomRow) : `Unit ${uid}`;
        };

        const bookingRoomMismatchForKey = (bookingKey: string): boolean => {
            if (selectedRoomId === 'all' || !bookingKey.startsWith('b-') || !selectedObject) return false;
            const bid = Number(bookingKey.slice(2));
            const b = bookingsMergedForLabels.find((x) => normalizeUnitOrRoomId(x.id) === bid);
            if (!b) return false;
            const roomRow = roomsForSelectedObject.find(
                (r) => stableAccountancyRoomLabel(r) === selectedRoomId,
            );
            if (!roomRow) return false;
            return normalizeUnitOrRoomId(b.unitId) !== roomRow.id;
        };

        const bookingGroups: OperationListGroup[] = bookingEntries.map(([key, rows]) => {
            const bid = Number(key.slice(2));
            const b = bookingsMergedForLabels.find((x) => normalizeUnitOrRoomId(x.id) === bid);
            const { label, bookingGroupLine } = buildBookingGroupLine(bid, bookingsMergedForLabels);

            let finalRows = rows;
            if (selectedObject && commissionCalculationMonthKey && bookingAutoCommissionByBookingId.has(bid)) {
                const commissionDetail = bookingAutoCommissionByBookingId.get(bid)!;
                const [cy, cm] = commissionCalculationMonthKey.split('-').map(Number);
                const lastDay = new Date(cy, cm, 0);
                const synthetic: OperationRow = {
                    id: `auto-commission-${key}-${commissionCalculationMonthKey}`,
                    type: 'expense',
                    entityId: '',
                    readOnlySynthetic: true,
                    status: 'confirmed',
                    date: lastDay,
                    category: BOOKING_GROUP_MANAGEMENT_COMMISSION_AUTO_CATEGORY,
                    comment: '',
                    quantity: 1,
                    amount: -commissionDetail.commission,
                    reportMonth: commissionCalculationMonthKey,
                    bookingId: bid,
                    syntheticCommissionDetail: commissionDetail,
                    syntheticCommissionPercent: commissionDetail.commissionPercent,
                    syntheticCommissionPercentOverridden: commissionDetail.commissionPercentOverridden,
                };
                finalRows = [...rows, synthetic];
                sortRowsByAccountancyCategoryOrder(finalRows, BOOKING_GROUP_CATEGORY_ORDER);
            }

            return {
                key,
                label,
                ...(bookingGroupLine != null ? { bookingGroupLine } : {}),
                rows: finalRows,
                bookingRoomMismatch: bookingRoomMismatchForKey(key),
                bookingUnitRoomName: b != null ? resolveBookingUnitRoomName(b.unitId) : null,
            };
        });

        const bySub = new Map<string, OperationRow[]>();
        for (const sid of NO_BOOKING_SUBGROUP_ORDER) {
            bySub.set(sid, []);
        }
        for (const row of noneRows) {
            const sid = resolveNoBookingSubgroupForTransaction(
                row.categoryId,
                row.category,
                allCategories,
            );
            bySub.get(sid)!.push(row);
        }

        if (
            selectedObject &&
            selectedRoomRow &&
            commissionCalculationMonthKey &&
            selectedRoomId !== 'all'
        ) {
            const getSchemeForBookingId = (bookingId: number): CommissionSchemeId => {
                const booking = bookingsMergedForLabels.find(
                    (x) => normalizeUnitOrRoomId(x.id) === bookingId,
                );
                const room = booking
                    ? roomsForSelectedObject.find((r) => r.id === booking.unitId)
                    : undefined;
                const scheme = room?.commissionSchemeId;
                return scheme != null && scheme >= 1 && scheme <= 4
                    ? (scheme as CommissionSchemeId)
                    : DEFAULT_COMMISSION_SCHEME_ID;
            };

            const getPercentForBooking = (bookingId: number): ManagementCommissionPercent => {
                const fromAuto = bookingAutoCommissionByBookingId.get(bookingId);
                if (fromAuto?.commissionPercent != null) return fromAuto.commissionPercent;
                const override = commissionRatesByBookingId[bookingId]?.percent;
                if (override != null) return override;
                const booking = bookingsMergedForLabels.find(
                    (x) => normalizeUnitOrRoomId(x.id) === bookingId,
                );
                const nights = booking
                    ? getNightsCount(booking.arrival, booking.departure)
                    : 1;
                return getDefaultManagementCommissionPercent(getSchemeForBookingId(bookingId), nights);
            };

            const bookingExpenseRows = filteredOperations.filter(
                (row) =>
                    row.type === 'expense' &&
                    row.bookingId != null &&
                    row.includeInSynthetic !== false &&
                    row.category !== 'Комиссия за управление' &&
                    row.category !== BOOKING_GROUP_MANAGEMENT_COMMISSION_AUTO_CATEGORY,
            );
            const commonAndGuestRows = noneRows.filter((row) => {
                const sid = resolveNoBookingSubgroupForTransaction(
                    row.categoryId,
                    row.category,
                    allCategories,
                );
                return (
                    (sid === 'common' || sid === 'guest') &&
                    row.includeInSynthetic !== false
                );
            });
            const toLineItems = (rows: OperationRow[]) =>
                rows.map((row) => ({
                    kind: row.type,
                    id: row.entityId || row.id,
                    date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
                    category: row.category,
                    amount: Math.abs(row.amount),
                    comment: row.comment,
                }));

            let bookingExpenseShare = 0;
            const bookingShareLineItems = bookingExpenseRows.map((row) => {
                const bid = row.bookingId!;
                const percent = getPercentForBooking(bid);
                const share = row.amount * (percent / 100);
                bookingExpenseShare += share;
                return {
                    kind: 'expense' as const,
                    id: row.entityId || row.id,
                    date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
                    category: `${row.category} · ${percent}%`,
                    amount: Math.abs(share),
                    comment: row.comment,
                };
            });

            const commonAndGuestBase = commonAndGuestRows.reduce((sum, row) => sum + row.amount, 0);
            const rawAmount = bookingExpenseShare + commonAndGuestBase;
            const amount = Math.abs(rawAmount);
            const [cy, cm] = commissionCalculationMonthKey.split('-').map(Number);
            const lastDay = new Date(cy, cm, 0);
            const syntheticCommissionDetail: BookingCommissionResult = {
                bookingId: 0,
                bookingTitle: HOLY_COW_EXPENSE_SHARE_AUTO_CATEGORY,
                nights: 0,
                schemeId: DEFAULT_COMMISSION_SCHEME_ID,
                steps: [
                    {
                        description: 'Доля от расходов по броням (× процент каждой брони)',
                        value: bookingExpenseShare,
                        formula: 'Σ (расход × % комиссии брони) по каждой транзакции',
                        lineItems: bookingShareLineItems,
                    },
                    {
                        description: 'Общие расходы и расходы гостя',
                        value: commonAndGuestBase,
                        formula: 'Σ всех транзакций из групп «Общие расходы» и «Расходы гостя» с учётом знака',
                        lineItems: toLineItems(commonAndGuestRows),
                    },
                    {
                        description: HOLY_COW_EXPENSE_SHARE_AUTO_CATEGORY,
                        value: amount,
                        formula: `|${bookingExpenseShare.toFixed(2)} + ${commonAndGuestBase.toFixed(2)}| = ${amount.toFixed(2)}`,
                    },
                ],
                commission: amount,
                income: 0,
                totalExpenses: bookingExpenseShare + commonAndGuestBase,
                otaCoAgentExpenses: 0,
                divisibleExpenses: 0,
                indivisibleExpenses: 0,
                commissionBaseIncome: 0,
                commissionPercentOverridden: false,
            };

            bySub.get('hc')!.push({
                id: `auto-hc-expense-share-${selectedObject.id}-${selectedRoomId}-${commissionCalculationMonthKey}`,
                type: 'expense',
                entityId: '',
                readOnlySynthetic: true,
                status: 'confirmed',
                date: lastDay,
                category: HOLY_COW_EXPENSE_SHARE_AUTO_CATEGORY,
                comment: '',
                quantity: 1,
                amount,
                reportMonth: commissionCalculationMonthKey,
                syntheticCommissionDetail,
            });
        }

        for (const sid of NO_BOOKING_SUBGROUP_ORDER) {
            sortRowsByAccountancyCategoryOrder(bySub.get(sid)!, getNoBookingSubgroupCategoryOrder(sid));
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
        selectedRoomId,
        t,
        roomsForSelectedObject,
        selectedObject,
        selectedRoomRow,
        commissionCalculationMonthKey,
        bookingAutoCommissionByBookingId,
        commissionRatesByBookingId,
        allCategories,
    ]);

    const toggleOperationGroupCollapsed = (groupKey: string) => {
        setCollapsedOperationGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            return next;
        });
    };

    const patchPendingDraft = useCallback((rowId: string, patch: Partial<PendingOperationDraft>) => {
        const clientId = pendingClientIdFromRowId(rowId);
        if (!clientId) return;
        setPendingDrafts((prev) =>
            prev.map((d) => (d.clientId === clientId ? { ...d, ...patch } : d)),
        );
    }, []);

    const pendingDraftRows = useMemo(
        () => pendingDrafts.map(pendingDraftToOperationRow),
        [pendingDrafts],
    );

    const defaultReportMonthForPending = useMemo(() => {
        if (commissionCalculationMonthKey) return commissionCalculationMonthKey;
        const m = (selectedMonth ?? '').trim();
        if (/^\d{4}-\d{2}$/.test(m)) return m;
        return reportMonthOptions[0]?.value ?? '';
    }, [commissionCalculationMonthKey, selectedMonth, reportMonthOptions]);

    const isSelectedMonthClosed = useMemo(() => {
        const m = (selectedMonth ?? '').trim();
        return m !== '' && closedReportMonths.has(m);
    }, [selectedMonth, closedReportMonths]);

    const selectedMonthLabel = useMemo(() => {
        if (!selectedMonth) return '';
        const [y, m] = selectedMonth.split('-').map(Number);
        if (!y || !m) return selectedMonth;
        return `${t(`accountancy.months.${m}`)} ${y}`;
    }, [selectedMonth, t]);

    const isOperationRowPeriodLocked = useCallback(
        (row: OperationRow) => {
            const lm = ledgerMonthFromRecord(row.date, row.reportMonth);
            return lm != null && closedReportMonths.has(lm);
        },
        [closedReportMonths],
    );

    const handlePeriodLockConfirm = async () => {
        if (!selectedMonth || !periodLockDialog) return;
        setPeriodLockLoading(true);
        try {
            const res =
                periodLockDialog === 'close'
                    ? await closeReportMonth(selectedMonth)
                    : await reopenReportMonth(selectedMonth);
            setSnackbar({
                open: true,
                message:
                    res.message ||
                    (periodLockDialog === 'close'
                        ? t('accountancy.reportPeriodLockedSuccess')
                        : t('accountancy.reportPeriodUnlockedSuccess')),
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                setClosedReportMonths((prev) => {
                    const next = new Set(prev);
                    if (periodLockDialog === 'close') {
                        next.add(selectedMonth);
                    } else {
                        next.delete(selectedMonth);
                    }
                    return next;
                });
                if (periodLockDialog === 'close') {
                    setPendingDrafts([]);
                }
                setPeriodLockDialog(null);
            }
        } catch (error) {
            console.error('period lock toggle:', error);
            setSnackbar({
                open: true,
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setPeriodLockLoading(false);
        }
    };

    const quickAddCategoryContext = useMemo(
        () =>
            buildAccountancyQuickAddCategoryContext({
                selectedObject: selectedObject ?? null,
                selectedRoomId,
                selectedRoom: selectedRoomRow,
                objects,
                objectGroupMembers: selectedObjectGroupMembers,
            }),
        [selectedObject, selectedRoomId, selectedRoomRow, objects, selectedObjectGroupMembers],
    );

    useEffect(() => {
        if (!selectedObject) return;
        setPendingDrafts((prev) => {
            let changed = false;
            const next = prev.map((draft) => {
                if (!draft.categoryId.trim()) return draft;
                const cats = draft.type === 'expense' ? categoriesExpense : categoriesIncome;
                const cat = findCategoryById(cats, draft.categoryId);
                if (!cat) return draft;
                const defaults = resolveCategoryTransactionDefaults(cat, quickAddCategoryContext);
                const patched = {
                    ...draft,
                    source: defaults.source,
                    recipient: defaults.recipient,
                    ...(defaults.pricePerUnit != null ? { unitAmount: defaults.pricePerUnit } : {}),
                };
                if (
                    patched.source !== draft.source ||
                    patched.recipient !== draft.recipient ||
                    (defaults.pricePerUnit != null && patched.unitAmount !== draft.unitAmount)
                ) {
                    changed = true;
                }
                return patched;
            });
            return changed ? next : prev;
        });
    }, [quickAddCategoryContext, selectedObject, categoriesExpense, categoriesIncome]);

    const handleAddPendingDraft = useCallback(
        (type: 'expense' | 'income') => {
            if (!selectedObject || isSelectedMonthClosed) return;
            const draft: PendingOperationDraft = {
                clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                type,
                status: 'draft',
                date: new Date(),
                category: '',
                categoryId: '',
                comment: '',
                quantity: 1,
                unitAmount: 0,
                reportMonth: defaultReportMonthForPending,
            };
            setPendingDrafts((prev) => [...prev, draft]);
        },
        [selectedObject, defaultReportMonthForPending, isSelectedMonthClosed],
    );

    const handlePendingDraftCancel = useCallback((row: OperationRow) => {
        if (!row.isPendingDraft) return;
        const clientId = pendingClientIdFromRowId(row.id);
        if (!clientId) return;
        setPendingDrafts((prev) => prev.filter((d) => d.clientId !== clientId));
        setCommentDraftByRowId((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
        });
        setAmountEditingId((current) => {
            if (current === row.id) {
                setAmountDraft('');
                return null;
            }
            return current;
        });
    }, []);

    const handlePendingDraftSave = async (row: OperationRow) => {
        if (!row.isPendingDraft || !selectedObject) return;
        const clientId = pendingClientIdFromRowId(row.id);
        if (!clientId) return;
        const draft = pendingDrafts.find((d) => d.clientId === clientId);
        if (!draft) return;

        if (!draft.categoryId.trim()) {
            setSnackbar({
                open: true,
                message: t('accountancy.formErrors'),
                severity: 'error',
            });
            return;
        }
        const total = draft.unitAmount * draft.quantity;
        if (!(total > 0)) {
            setSnackbar({
                open: true,
                message: t('accountancy.amountMustBeGreaterThanZero'),
                severity: 'warning',
            });
            return;
        }

        const roomName = selectedRoomId === 'all' ? undefined : selectedRoomId;
        const roomContext = quickAddCategoryContext;
        setPendingDraftSavingId(row.id);
        try {
            if (draft.type === 'expense') {
                const payload: Expense = {
                    objectId: selectedObject.id,
                    roomName,
                    categoryId: draft.categoryId.trim(),
                    category: draft.category.trim(),
                    amount: draft.unitAmount,
                    quantity: draft.quantity,
                    date: draft.date,
                    comment: draft.comment || '',
                    status: draft.status,
                    reportMonth: draft.reportMonth || undefined,
                    source: resolveCategorySourceRecipientValue(draft.source, roomContext),
                    recipient: resolveCategorySourceRecipientValue(draft.recipient, roomContext),
                    attachments: [],
                    accountantId: '',
                    commissionPercent: 30,
                };
                const res = await addExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseAdded'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success && res.id) {
                    setExpenses((prev) => [...prev, { ...payload, _id: res.id }]);
                    setPendingDrafts((prev) => prev.filter((d) => d.clientId !== clientId));
                }
            } else {
                const payload: Income = {
                    objectId: selectedObject.id,
                    roomName,
                    categoryId: draft.categoryId.trim(),
                    category: draft.category.trim(),
                    amount: draft.unitAmount,
                    quantity: draft.quantity,
                    date: draft.date,
                    comment: draft.comment || undefined,
                    status: draft.status,
                    reportMonth: draft.reportMonth || undefined,
                    source: resolveCategorySourceRecipientValue(draft.source, roomContext),
                    recipient: resolveCategorySourceRecipientValue(draft.recipient, roomContext),
                    attachments: [],
                    accountantId: '',
                    commissionPercent: 30,
                };
                const res = await addIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeAdded'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success && res.id) {
                    setIncomes((prev) => [...prev, { ...payload, _id: res.id }]);
                    setPendingDrafts((prev) => prev.filter((d) => d.clientId !== clientId));
                }
            }
        } catch (error) {
            console.error('Error saving pending operation:', error);
            setSnackbar({
                open: true,
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setPendingDraftSavingId(null);
        }
    };

    const handleStatusToggle = async (row: OperationRow) => {
        if (row.readOnlySynthetic) return;
        if (row.isPendingDraft) {
            patchPendingDraft(row.id, {
                status: row.status === 'confirmed' ? 'draft' : 'confirmed',
            });
            return;
        }
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
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setStatusUpdatingId(null);
        }
    };

    const handleReportMonthChange = async (row: OperationRow, newValue: string) => {
        if (row.readOnlySynthetic) return;
        if (row.isPendingDraft) {
            patchPendingDraft(row.id, { reportMonth: newValue });
            return;
        }
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
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setReportMonthUpdatingId(null);
        }
    };

    const handleQuantityChange = async (row: OperationRow, newQuantity: number) => {
        if (row.readOnlySynthetic) return;
        if (row.isPendingDraft) {
            if (newQuantity < 1) return;
            patchPendingDraft(row.id, { quantity: newQuantity });
            return;
        }
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
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setQuantityUpdatingId(null);
        }
    };

    const handleCategoryChange = async (row: OperationRow, newCategoryId: string) => {
        if (row.readOnlySynthetic) return;
        if (row.isPendingDraft) {
            const cats = row.type === 'expense' ? categoriesExpense : categoriesIncome;
            const resolved = resolveCategoryFieldsFromId(newCategoryId, cats, row.type);
            const cat = findCategoryById(cats, newCategoryId);
            const defaults = resolveCategoryTransactionDefaults(cat, quickAddCategoryContext);
            patchPendingDraft(row.id, {
                categoryId: newCategoryId,
                category: resolved?.category ?? '',
                source: defaults.source,
                recipient: defaults.recipient,
                ...(defaults.pricePerUnit != null ? { unitAmount: defaults.pricePerUnit } : {}),
            });
            return;
        }
        if (!row.entityId) return;
        if (!newCategoryId.trim()) {
            setSnackbar({
                open: true,
                message: t('accountancy.formErrors'),
                severity: 'error',
            });
            return;
        }
        if (newCategoryId === row.categoryId) return;
        const cats = row.type === 'expense' ? categoriesExpense : categoriesIncome;
        const resolved = resolveCategoryFieldsFromId(newCategoryId, cats, row.type);
        if (!resolved) {
            setSnackbar({
                open: true,
                message: t('accountancy.categoryNotFound'),
                severity: 'error',
            });
            return;
        }
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
                    categoryId: resolved.categoryId,
                    category: resolved.category,
                };
                const res = await updateExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) =>
                            e._id === row.entityId
                                ? { ...e, categoryId: resolved.categoryId, category: resolved.category }
                                : e,
                        ),
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
                    categoryId: resolved.categoryId,
                    category: resolved.category,
                };
                const res = await updateIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) =>
                            i._id === row.entityId
                                ? { ...i, categoryId: resolved.categoryId, category: resolved.category }
                                : i,
                        ),
                    );
                }
            }
        } catch (error) {
            console.error('Error updating category:', error);
            setSnackbar({
                open: true,
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setInlinePatchUpdatingId(null);
        }
    };

    const handleCommentCommit = async (row: OperationRow, draft: string) => {
        if (row.readOnlySynthetic) return;
        if (row.isPendingDraft) {
            patchPendingDraft(row.id, { comment: draft });
            return;
        }
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
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setInlinePatchUpdatingId(null);
        }
    };

    const handleSourceChange = async (row: OperationRow, value: SourceRecipientOptionValue | '') => {
        if (row.readOnlySynthetic) return;
        if (row.isPendingDraft) {
            patchPendingDraft(row.id, { source: value || undefined });
            return;
        }
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
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setInlinePatchUpdatingId(null);
        }
    };

    const handleRecipientChange = async (row: OperationRow, value: SourceRecipientOptionValue | '') => {
        if (row.readOnlySynthetic) return;
        if (row.isPendingDraft) {
            patchPendingDraft(row.id, { recipient: value || undefined });
            return;
        }
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
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setInlinePatchUpdatingId(null);
        }
    };

    const handleOperationAmountCommit = async (row: OperationRow, draft: string) => {
        if (row.readOnlySynthetic) return;
        if (amountEditEscapeRef.current) {
            amountEditEscapeRef.current = false;
            return;
        }
        if (row.isPendingDraft) {
            const parsed = parseLocalizedTotalAmount(draft);
            if (parsed === null) {
                setSnackbar({
                    open: true,
                    message: t('accountancy.invalidTotalAmount'),
                    severity: 'error',
                });
                return;
            }
            if (parsed > 0) {
                const q = row.quantity || 1;
                patchPendingDraft(row.id, { unitAmount: parsed / q });
            }
            setAmountEditingId(null);
            setAmountDraft('');
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
        if (parsed <= 0) {
            setSnackbar({
                open: true,
                message: t('accountancy.amountMustBeGreaterThanZero'),
                severity: 'warning',
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
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setAmountUpdatingId(null);
            setAmountEditingId(null);
            setAmountDraft('');
        }
    };

    const handleOperationDeleteClick = (row: OperationRow) => {
        if (row.readOnlySynthetic) return;
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
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setOperationDeletingId(null);
            setDeleteDialogOpen(false);
            setOperationToDelete(null);
        }
    };

    const handleSyntheticCommissionPercentChange = async (
        row: OperationRow,
        percent: ManagementCommissionPercent,
    ) => {
        if (!row.readOnlySynthetic || row.bookingId == null) return;
        if (isOperationRowPeriodLocked(row)) {
            setSnackbar({
                open: true,
                message: t('accountancy.reportPeriodLockedAlert'),
                severity: 'warning',
            });
            return;
        }
        const bookingId = row.bookingId;
        setCommissionPercentUpdatingBookingId(bookingId);
        try {
            await saveBookingManagementCommissionRate(bookingId, percent, row.reportMonth);
            setCommissionRatesByBookingId((prev) => ({
                ...prev,
                [bookingId]: {
                    ...(prev[bookingId] ?? { bookingId }),
                    bookingId,
                    percent,
                },
            }));
        } catch (error) {
            console.error('Error updating commission percent:', error);
            setSnackbar({
                open: true,
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setCommissionPercentUpdatingBookingId(null);
        }
    };

    const handleIncludeInSyntheticChange = async (row: OperationRow, included: boolean) => {
        if (row.readOnlySynthetic || !row.entityId) return;
        setIncludeInSyntheticUpdatingId(row.id);
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row.entityId);
                if (!expense) return;
                const payload: Expense = {
                    ...expense,
                    includeInSynthetic: included,
                    commissionPercent: expense.commissionPercent ?? 30,
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
                        prev.map((e) =>
                            e._id === row.entityId ? { ...e, includeInSynthetic: included } : e,
                        ),
                    );
                }
                return;
            }
            const income = incomes.find((i) => i._id === row.entityId);
            if (!income) return;
            const payload: Income = {
                ...income,
                includeInSynthetic: included,
                commissionPercent: income.commissionPercent ?? 30,
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
                    prev.map((i) =>
                        i._id === row.entityId ? { ...i, includeInSynthetic: included } : i,
                    ),
                );
            }
        } catch (error) {
            console.error('Error updating includeInSynthetic:', error);
            setSnackbar({
                open: true,
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setIncludeInSyntheticUpdatingId(null);
        }
    };

    const handleCommissionPercentChange = async (
        row: OperationRow,
        percent: 15 | 20 | 25 | 30,
    ) => {
        if (row.readOnlySynthetic || !row.entityId) return;
        setCommissionPercentUpdatingId(row.id);
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row.entityId);
                if (!expense) return;
                const payload: Expense = {
                    ...expense,
                    commissionPercent: percent,
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
                        prev.map((e) =>
                            e._id === row.entityId ? { ...e, commissionPercent: percent } : e,
                        ),
                    );
                }
                return;
            }
            const income = incomes.find((i) => i._id === row.entityId);
            if (!income) return;
            const payload: Income = {
                ...income,
                commissionPercent: percent,
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
                    prev.map((i) =>
                        i._id === row.entityId ? { ...i, commissionPercent: percent } : i,
                    ),
                );
            }
        } catch (error) {
            console.error('Error updating commission percent:', error);
            setSnackbar({
                open: true,
                message: resolveApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setCommissionPercentUpdatingId(null);
        }
    };

    const quantityOptions = useMemo(() => {
        const opts: number[] = [];
        for (let i = 1; i <= 8; i++) opts.push(i);
        return opts;
    }, []);

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
        categoryItemsExpense: categorySelectItemsExpense,
        categoryItemsIncome: categorySelectItemsIncome,
        sourceRecipientOptions: sourceRecipientOptionsTable,
        recipientRecipientOptions: recipientRecipientOptionsTable,
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
        commissionPercentUpdatingBookingId,
        handleSyntheticCommissionPercentChange,
        pendingDraftSavingId,
        onPendingDraftSave: handlePendingDraftSave,
        onPendingDraftCancel: handlePendingDraftCancel,
        includeInSyntheticUpdatingId,
        handleIncludeInSyntheticChange,
        commissionPercentUpdatingId,
        handleCommissionPercentChange,
    };

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

            

            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 2,
                    mb: 3,
                    flexDirection: { xs: 'column', md: 'row' },
                }}
            >
                <Stack spacing={1} direction="row" flexWrap="wrap">
                    <Link href="/dashboard/accountancy/transactions">
                        <Button size="small" variant="contained">
                            {t('accountancy.transactionsTitle')}
                        </Button>
                    </Link>

                    <Link href="/dashboard/accountancy/counterparties">
                        <Button size="small" variant="outlined">
                            {t('accountancy.counterparty.title')}
                        </Button>
                    </Link>

                    <Link href="/dashboard/accountancy/cashflow">
                        <Button size="small" variant="outlined">
                            {t('accountancy.cashflow.title')}
                        </Button>
                    </Link>

                    <Link href="/dashboard/accountancy/commission">
                        <Button size="small" variant="contained">
                            {t('accountancy.commission.title')}
                        </Button>
                    </Link>
                </Stack>

                <Stack
                    spacing={1}
                    direction="row"
                    flexWrap="wrap"
                    justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
                >
                    <Link href="/dashboard/accountancy/expense/add">
                        <Button size="small" variant="contained" startIcon={<AddIcon />}>
                            {t('accountancy.addExpense')}
                        </Button>
                    </Link>

                    <Link href="/dashboard/accountancy/income/add">
                        <Button size="small" variant="outlined" startIcon={<AddIcon />}>
                            {t('accountancy.addIncome')}
                        </Button>
                    </Link>

                    <Link href="/dashboard/accountancy/transactions/bulk-add">
                        <Button size="small" variant="outlined" startIcon={<AddIcon />}>
                            {t('accountancy.bulkAddTransactions')}
                        </Button>
                    </Link>
                </Stack>
            </Box>

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
                    <AccountancyObjectTreeTable
                        objects={objects}
                        selectedObjectId={selectedObjectId}
                        selectedRoomId={selectedRoomId}
                        onSelectObject={(objectId) => {
                            const members = getAccountancyObjectGroupMembers(objects, objectId);
                            const primaryId =
                                members.length > 0
                                    ? members.reduce((min, m) => (m.id < min.id ? m : min)).id
                                    : objectId;
                            setSelectedObjectId(primaryId);
                            setSelectedRoomId('all');
                        }}
                        onSelectRoom={(objectId, roomName) => {
                            setSelectedObjectId(objectId);
                            setSelectedRoomId(roomName);
                        }}
                        getRoomRowHighlight={getAccountancyObjectRoomRowHighlight}
                    />
                </Paper>

                <Paper sx={{ p: 1.5, flex: 2, minWidth: 0 }}>
                    <Typography variant="h6" sx={{ mb: 1.5, fontSize: '1.05rem' }}>
                        {t('accountancy.statsByRoom')}
                    </Typography>
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={2}
                        sx={{ mb: 2 }}
                        flexWrap="wrap"
                        useFlexGap
                        alignItems={{ md: 'center' }}
                    >
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
                                value={
                                    selectedObjectId === 'all'
                                        ? ''
                                        : String(
                                              accountancyObjectGroups.find((g) =>
                                                  g.members.some((m) => m.id === selectedObjectId),
                                              )?.primaryObjectId ?? selectedObjectId,
                                          )
                                }
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setSelectedObjectId(value ? Number(value) : 'all');
                                    setSelectedRoomId('all');
                                }}
                            >
                                <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                {accountancyObjectGroups.map((group) => (
                                    <MenuItem key={group.displayName} value={String(group.primaryObjectId)}>
                                        {group.displayName}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {selectedObject && (
                            <FormControl sx={{ minWidth: 180 }}>
                                <InputLabel>{t('common.room')}</InputLabel>
                                <Select
                                    label={t('common.room')}
                                    value={selectedRoomId === 'all' ? '' : selectedRoomId}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setSelectedRoomId(value ? String(value) : 'all');
                                    }}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {roomsForSelectedObject.map((room) => (
                                        <MenuItem
                                            key={room.id}
                                            value={stableAccountancyRoomLabel(room)}
                                        >
                                            {room.name || `Room ${room.id}`}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        {selectedMonth ? (
                            <Box
                                sx={{
                                    ml: { md: 'auto' },
                                    alignSelf: { xs: 'flex-end', md: 'auto' },
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.75,
                                    flexShrink: 0,
                                }}
                            >
                                {isSelectedMonthClosed ? (
                                    <Chip
                                        size="small"
                                        color="warning"
                                        icon={<LockIcon sx={{ fontSize: '0.875rem !important' }} />}
                                        label={t('accountancy.reportPeriodLockedBadge')}
                                        sx={{ height: 24, fontSize: '0.7rem', '& .MuiChip-label': { px: 0.75 } }}
                                    />
                                ) : null}
                                <Button
                                    size="small"
                                    variant={isSelectedMonthClosed ? 'outlined' : 'contained'}
                                    color={isSelectedMonthClosed ? 'warning' : 'primary'}
                                    startIcon={
                                        isSelectedMonthClosed ? (
                                            <LockOpenIcon sx={{ fontSize: '0.875rem !important' }} />
                                        ) : (
                                            <LockIcon sx={{ fontSize: '0.875rem !important' }} />
                                        )
                                    }
                                    onClick={() =>
                                        setPeriodLockDialog(isSelectedMonthClosed ? 'reopen' : 'close')
                                    }
                                    disabled={periodLockLoading}
                                    sx={{
                                        fontSize: '0.7rem',
                                        py: 0.25,
                                        px: 1,
                                        minHeight: 26,
                                        lineHeight: 1.2,
                                        '& .MuiButton-startIcon': { mr: 0.5, ml: -0.25 },
                                    }}
                                >
                                    {isSelectedMonthClosed
                                        ? t('accountancy.unlockReportPeriod')
                                        : t('accountancy.lockReportPeriod')}
                                </Button>
                            </Box>
                        ) : null}
                    </Stack>

                    {isSelectedMonthClosed ? (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            {t('accountancy.reportPeriodLockedAlert')}
                        </Alert>
                    ) : null}

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
                                        <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.openingBalanceColumn')}</TableCell>
                                        <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.amountColumn')} ({t('accountancy.expensesTitle')})</TableCell>
                                        <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.amountColumn')} ({t('accountancy.incomesTitle')})</TableCell>
                                        <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.balance')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredRoomStats.map((row) => {
                                        const balance = row.openingBalance - row.expenses + row.incomes;
                                        const isUnallocatedRow = row.roomKey === ACCOUNTANCY_UNALLOCATED_ROOM_KEY;
                                        return (
                                            <TableRow
                                                key={row.roomKey}
                                                onClick={
                                                    isUnallocatedRow
                                                        ? undefined
                                                        : () => setSelectedRoomId(row.roomKey)
                                                }
                                                sx={{
                                                    cursor: isUnallocatedRow ? 'default' : 'pointer',
                                                    '&:hover': {
                                                        bgcolor: isUnallocatedRow ? undefined : 'action.hover',
                                                    },
                                                }}
                                            >
                                                <TableCell sx={{ py: 0.5, px: 1 }}>{row.roomName}</TableCell>
                                                <TableCell sx={{ py: 0.5, px: 1 }}>{formatAmount(row.openingBalance)}</TableCell>
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
                                    {operationGroups.length === 0 && pendingDraftRows.length === 0 ? (
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
                                                    <TableCell align="center" sx={{ width: OP_TABLE_DIVISIBILITY_COL_WIDTH_PX }}>
                                                        {t('accountancy.divisibility')}
                                                    </TableCell>
                                                    <TableCell sx={{ width: OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX }}>{t('accountancy.source')}</TableCell>
                                                    <TableCell sx={{ width: OP_TABLE_SOURCE_RECIPIENT_COL_WIDTH_PX }}>{t('accountancy.recipient')}</TableCell>
                                                    <TableCell
                                                        align="right"
                                                        sx={{
                                                            width: OP_TABLE_ACTIONS_COL_WIDTH_PX,
                                                            minWidth: OP_TABLE_ACTIONS_COL_WIDTH_PX,
                                                            px: 0.25,
                                                        }}
                                                    />
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {operationGroups.map((group) => {
                                                    const collapsed = collapsedOperationGroups.has(group.key);
                                                    const groupIsEmpty = group.rows.length === 0;
                                                    const line = group.bookingGroupLine;
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
                                                                colSpan={11}
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
                                                                    ...(group.key === 'nobook-mutual' ||
                                                                    group.key === 'nobook-other'
                                                                        ? {
                                                                              borderTop: '3px solid',
                                                                              borderTopColor: 'text.primary',
                                                                          }
                                                                        : {}),
                                                                    borderBottom: '1px solid',
                                                                    borderBottomColor: 'divider',
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
                                                                    {line != null ? (
                                                                        <BookingGroupLineText
                                                                            line={line}
                                                                            typographySx={{
                                                                                fontSize: '0.7rem',
                                                                                fontWeight: groupIsEmpty ? 500 : 600,
                                                                                overflow: 'hidden',
                                                                                textOverflow: 'ellipsis',
                                                                                whiteSpace: 'nowrap',
                                                                                minWidth: 0,
                                                                                color: 'inherit',
                                                                            }}
                                                                        />
                                                                    ) : (
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
                                                                    )}
                                                                    {group.bookingRoomMismatch ? (
                                                                        <Tooltip
                                                                            title={t(
                                                                                'accountancy.bookingRoomFilterMismatch',
                                                                            )
                                                                                .replace(
                                                                                    '{{roomId}}',
                                                                                    String(
                                                                                        selectedRoomId === 'all'
                                                                                            ? '—'
                                                                                            : selectedRoomId,
                                                                                    ),
                                                                                )
                                                                                .replace(
                                                                                    '{{bookingId}}',
                                                                                    String(
                                                                                        Number(
                                                                                            group.key.slice(2),
                                                                                        ),
                                                                                    ),
                                                                                )
                                                                                .replace(
                                                                                    '{{bookingUnitRoomName}}',
                                                                                    group.bookingUnitRoomName ?? '—',
                                                                                )}
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
                                                                    periodLocked={isOperationRowPeriodLocked(row)}
                                                                    showDivisibilityCheckbox={operationRowShowsDivisibilityCheckbox(
                                                                        group.key,
                                                                        row,
                                                                    )}
                                                                    shouldShowCommissionPercentSelect={(r) =>
                                                                        operationRowShowsCommissionPercentSelect(group.key, r)
                                                                    }
                                                                    {...sharedOperationRowProps}
                                                                />
                                                            ))}
                                                    </Fragment>
                                                    );
                                                })}
                                                {pendingDraftRows.map((row) => (
                                                    <AccountancyOverviewOperationTableRow
                                                        key={row.id}
                                                        row={row}
                                                        periodLocked={isSelectedMonthClosed}
                                                        shouldShowCommissionPercentSelect={() => false}
                                                        {...sharedOperationRowProps}
                                                    />
                                                ))}
                                            </TableBody>
                                        </Table>
                                        </TableContainer>
                                    )}
                                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                        <Tooltip
                                            title={
                                                isSelectedMonthClosed
                                                    ? t('accountancy.reportPeriodLockedAlert')
                                                    : t('accountancy.addIncome')
                                            }
                                        >
                                            <span>
                                                <Button
                                                    variant="outlined"
                                                    color="success"
                                                    size="small"
                                                    onClick={() => handleAddPendingDraft('income')}
                                                    disabled={isSelectedMonthClosed}
                                                    sx={{ minWidth: 40, px: 1, fontWeight: 700, fontSize: '1.1rem', lineHeight: 1 }}
                                                    aria-label={t('accountancy.addIncome')}
                                                >
                                                    +
                                                </Button>
                                            </span>
                                        </Tooltip>
                                        <Tooltip
                                            title={
                                                isSelectedMonthClosed
                                                    ? t('accountancy.reportPeriodLockedAlert')
                                                    : t('accountancy.addExpense')
                                            }
                                        >
                                            <span>
                                                <Button
                                                    variant="outlined"
                                                    color="error"
                                                    size="small"
                                                    onClick={() => handleAddPendingDraft('expense')}
                                                    disabled={isSelectedMonthClosed}
                                                    sx={{ minWidth: 40, px: 1, fontWeight: 700, fontSize: '1.1rem', lineHeight: 1 }}
                                                    aria-label={t('accountancy.addExpense')}
                                                >
                                                    −
                                                </Button>
                                            </span>
                                        </Tooltip>
                                    </Stack>
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

            <Dialog
                open={periodLockDialog != null}
                onClose={() => !periodLockLoading && setPeriodLockDialog(null)}
            >
                <DialogTitle>
                    {periodLockDialog === 'close'
                        ? t('accountancy.lockReportPeriodConfirmTitle')
                        : t('accountancy.unlockReportPeriodConfirmTitle')}
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {(periodLockDialog === 'close'
                            ? t('accountancy.lockReportPeriodConfirmMessage')
                            : t('accountancy.unlockReportPeriodConfirmMessage')
                        ).replace('{{period}}', selectedMonthLabel || selectedMonth)}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPeriodLockDialog(null)} disabled={periodLockLoading}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={() => void handlePeriodLockConfirm()}
                        color={periodLockDialog === 'close' ? 'warning' : 'primary'}
                        variant="contained"
                        disabled={periodLockLoading}
                    >
                        {periodLockDialog === 'close'
                            ? t('accountancy.lockReportPeriod')
                            : t('accountancy.unlockReportPeriod')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}


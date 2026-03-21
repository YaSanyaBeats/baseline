'use client'

import { useEffect, useMemo, useState } from "react";
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
    TableHead,
    TableRow,
    TextField,
    Switch,
    IconButton,
    Chip,
    Tooltip,
} from "@mui/material";
import { Visibility } from "@mui/icons-material";
import { useUser } from "@/providers/UserProvider";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useTranslation } from "@/i18n/useTranslation";
import Link from 'next/link';
import { useObjects } from "@/providers/ObjectsProvider";
import { Booking, Expense, Income } from "@/lib/types";
import { getExpenseSum, getIncomeSum } from "@/lib/accountancyUtils";
import { getExpenses, updateExpense } from "@/lib/expenses";
import { getIncomes, updateIncome } from "@/lib/incomes";
import { getBookingsByIds } from "@/lib/bookings";
import { getCounterparties } from "@/lib/counterparties";
import { getCashflows } from "@/lib/cashflows";
import { getUsersWithCashflow } from "@/lib/users";
import { formatSourceRecipientLabel } from "@/components/accountancy/SourceRecipientSelect";

const OVERVIEW_FILTERS_KEY = 'accountancy-overview-filters';

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
                const [exp, inc, cps, cfs, usersCf] = await Promise.all([
                    getExpenses(),
                    getIncomes(),
                    getCounterparties(),
                    getCashflows(),
                    getUsersWithCashflow(),
                ]);
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

    // Формат YYYY-MM-DD в локальной таймзоне (без сдвига UTC)
    const toLocalDateString = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Эффективный период: либо выбранный месяц, либо кастомные dateFrom/dateTo
    const effectiveDateRange = useMemo(() => {
        if (selectedMonth) {
            const [y, m] = selectedMonth.split('-').map(Number);
            const from = new Date(y, m - 1, 1);
            const to = new Date(y, m, 0);
            return { from: toLocalDateString(from), to: toLocalDateString(to) };
        }
        return { from: dateFrom, to: dateTo };
    }, [selectedMonth, dateFrom, dateTo]);

    const isDateInRange = useMemo(() => {
        const { from: effFrom, to: effTo } = effectiveDateRange;
        if (!effFrom && !effTo) return () => true;
        return (d: Date | string | undefined) => {
            if (!d) return true;
            const date = new Date(d as string | Date);
            if (effFrom) {
                const from = new Date(effFrom);
                if (date < from) return false;
            }
            if (effTo) {
                const to = new Date(effTo);
                to.setDate(to.getDate() + 1);
                if (date >= to) return false;
            }
            return true;
        };
    }, [effectiveDateRange]);

    const filteredByDate = useMemo(
        () => ({
            expenses: expenses.filter((e) => isDateInRange(e.date)),
            incomes: incomes.filter((i) => isDateInRange(i.date)),
        }),
        [expenses, incomes, isDateInRange],
    );

    const objectStats = useMemo(() => {
        const map: Record<number, { expenses: number; incomes: number }> = {};
        filteredByDate.expenses.forEach((e) => {
            if (!map[e.objectId]) map[e.objectId] = { expenses: 0, incomes: 0 };
            map[e.objectId].expenses += getExpenseSum(e);
        });
        filteredByDate.incomes.forEach((i) => {
            if (!map[i.objectId]) map[i.objectId] = { expenses: 0, incomes: 0 };
            map[i.objectId].incomes += getIncomeSum(i);
        });
        return map;
    }, [filteredByDate]);

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
         * Комната для строки в сводке: сначала unitId брони (если бронь найдена и сопоставлена с объектом),
         * иначе roomId записи. Так строки совпадают со списком операций при «все комнаты», где matchRoom не отсекает записи без разрешённой брони.
         */
        const resolveRecordRoomId = (
            recordObjectId: number,
            recordRoomId?: number,
            bookingId?: number,
        ): number | null => {
            if (recordObjectId !== objectId) return null;

            if (bookingId) {
                const booking = bookings.find((b) => b.id === bookingId);
                if (booking && bookingBelongsToObject(booking) && booking.unitId != null) {
                    return booking.unitId;
                }
            }

            if (recordRoomId != null) return recordRoomId;
            return null;
        };

        const expenseRoomId = (e: Expense) =>
            resolveRecordRoomId(e.objectId, e.roomId, e.bookingId);

        const incomeRoomId = (i: Income) =>
            resolveRecordRoomId(i.objectId, i.roomId, i.bookingId);

        const roomRows = roomsForSelectedObject.map((room) => {
            let expenses = 0;
            let incomes = 0;
            filteredByDate.expenses.forEach((e) => {
                if (expenseRoomId(e) === room.id) expenses += getExpenseSum(e);
            });
            filteredByDate.incomes.forEach((i) => {
                if (incomeRoomId(i) === room.id) incomes += getIncomeSum(i);
            });
            return {
                roomId: room.id,
                roomName: room.name || `Room ${room.id}`,
                expenses,
                incomes,
            };
        });

        return selectedRoomId === 'all'
            ? roomRows
            : roomRows.filter((row) => row.roomId === selectedRoomId);
    }, [selectedObject, roomsForSelectedObject, filteredByDate, bookings, selectedRoomId]);

    type OperationRow = {
        id: string;
        type: 'expense' | 'income';
        entityId: string;
        status: 'draft' | 'confirmed';
        date: Date | string;
        category: string;
        commentShort: string;
        quantity: number;
        amount: number;
        reportMonth: string;
        source?: string;
        recipient?: string;
        autoCreated?: boolean;
    };

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

        const shortComment = (s: string | undefined, maxLen = 40) =>
            !s ? '—' : s.length <= maxLen ? s : s.slice(0, maxLen) + '…';

        const rows: OperationRow[] = [];

        expenses
            .filter((e) => e.objectId === selectedObjectId && matchRoom(e.roomId, e.bookingId) && isDateInRange(e.date))
            .forEach((e) => {
                rows.push({
                    id: `exp-${e._id ?? ''}`,
                    type: 'expense',
                    entityId: e._id ?? '',
                    status: e.status,
                    date: e.date,
                    category: e.category ?? '—',
                    commentShort: shortComment(e.comment),
                    quantity: e.quantity ?? 1,
                    amount: -getExpenseSum(e),
                    reportMonth: e.reportMonth ?? '',
                    source: e.source,
                    recipient: e.recipient,
                    autoCreated: !!(e as Expense & { autoCreated?: unknown }).autoCreated,
                });
            });

        incomes
            .filter((i) => i.objectId === selectedObjectId && matchRoom(i.roomId, i.bookingId) && isDateInRange(i.date))
            .forEach((i) => {
                rows.push({
                    id: `inc-${i._id ?? ''}`,
                    type: 'income',
                    entityId: i._id ?? '',
                    status: (i as any).status ?? 'draft',
                    date: i.date,
                    category: i.category ?? '—',
                    commentShort: shortComment(i.comment),
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

    const quantityOptions = useMemo(() => {
        const opts: number[] = [];
        for (let i = 1; i <= 15; i++) opts.push(i);
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

                <Paper sx={{ p: 2, flex: 2 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
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
                                        setDateFrom(toLocalDateString(from));
                                        setDateTo(toLocalDateString(to));
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
                                        return (
                                            <TableRow
                                                key={row.roomId}
                                                onClick={() => setSelectedRoomId(row.roomId)}
                                                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
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
                                    <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
                                        {t('accountancy.operationsList')}
                                    </Typography>
                                    {filteredOperations.length === 0 ? (
                                        <Typography color="text.secondary">
                                            {t('accountancy.noOperations')}
                                        </Typography>
                                    ) : (
                                        <Table size="small" sx={{ mt: 1, fontSize: '0.75rem', '& .MuiTableCell-root': { py: 0.5, px: 1 }, '& .MuiSelect-select': { py: 0.5, minHeight: 'auto', fontSize: '0.75rem' }, '& .MuiSwitch-root': { transform: 'scale(0.75)' }, '& .MuiIconButton-root': { p: 0.25 } }}>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('common.status')}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.reportMonth')}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.dateColumn')}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.categoryColumn')}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.comment')}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('common.quantity')}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.amountColumn')}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.source')}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}>{t('accountancy.recipient')}</TableCell>
                                                    <TableCell sx={{ width: 36, py: 0.5, px: 0.5 }} />
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
                                                        <TableCell sx={{ py: 0.5, px: 1 }}>
                                                            <Tooltip title={row.status === 'confirmed' ? t('accountancy.statusConfirmed') : t('accountancy.statusDraft')}>
                                                            <Switch
                                                                    checked={row.status === 'confirmed'}
                                                                    onChange={() => handleStatusToggle(row)}
                                                                    disabled={statusUpdatingId === row.id}
                                                                    size="small"
                                                                    color="primary"
                                                                />
                                                            </Tooltip>
                                                        </TableCell>
                                                        <TableCell sx={{ py: 0.5, px: 1 }}>
                                                            <FormControl size="small" sx={{ minWidth: 85 }}>
                                                                <Select
                                                                    value={row.reportMonth || ''}
                                                                    displayEmpty
                                                                    onChange={(e) =>
                                                                        handleReportMonthChange(row, e.target.value as string)
                                                                    }
                                                                    disabled={reportMonthUpdatingId === row.id}
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
                                                        <TableCell sx={{ py: 0.5, px: 1 }}>
                                                            {row.date
                                                                ? new Date(row.date).toLocaleDateString('ru-RU', {
                                                                      day: '2-digit',
                                                                      month: '2-digit',
                                                                      year: 'numeric',
                                                                  })
                                                                : '—'}
                                                        </TableCell>
                                                        <TableCell sx={{ py: 0.5, px: 1 }}>
                                                            <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                                                                <span>{row.category}</span>
                                                                {row.autoCreated && (
                                                                    <Chip size="small" label={t('accountancy.autoAccounting.autoCreatedBadge')} color="success" variant="outlined" />
                                                                )}
                                                            </Stack>
                                                        </TableCell>
                                                        <TableCell sx={{ py: 0.5, px: 1 }}>{row.commentShort}</TableCell>
                                                        <TableCell sx={{ py: 0.5, px: 1 }}>
                                                            <FormControl size="small" sx={{ minWidth: 56 }}>
                                                                <Select
                                                                    value={row.quantity}
                                                                    onChange={(e) =>
                                                                        handleQuantityChange(row, Number(e.target.value))
                                                                    }
                                                                    disabled={quantityUpdatingId === row.id}
                                                                >
                                                                    {quantityOptions.map((q) => (
                                                                        <MenuItem key={q} value={q}>
                                                                            {q}
                                                                        </MenuItem>
                                                                    ))}
                                                                </Select>
                                                            </FormControl>
                                                        </TableCell>
                                                        <TableCell sx={{ py: 0.5, px: 1, color: row.amount >= 0 ? 'success.main' : 'error.main' }}>
                                                            {row.amount >= 0 ? '+' : ''}{formatAmount(row.amount)}
                                                        </TableCell>
                                                        <TableCell sx={{ py: 0.5, px: 1, whiteSpace: 'nowrap' }}>
                                                            {formatSourceRecipientLabel(row.source, objects, counterparties, usersWithCashflow, cashflows)}
                                                        </TableCell>
                                                        <TableCell sx={{ py: 0.5, px: 1, whiteSpace: 'nowrap' }}>
                                                            {formatSourceRecipientLabel(row.recipient, objects, counterparties, usersWithCashflow, cashflows)}
                                                        </TableCell>
                                                        <TableCell sx={{ py: 0.5, px: 0.5 }}>
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
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </Paper>
            </Stack>
        </Box>
    );
}


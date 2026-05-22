'use client';

import {
    Box,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Typography,
    Alert,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    CircularProgress,
    TableContainer,
    Divider,
    Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalculateIcon from '@mui/icons-material/Calculate';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';
import { getExpenses } from '@/lib/expenses';
import { getIncomes } from '@/lib/incomes';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoryNameByIdMap, resolveCategoryName } from '@/lib/accountancyCategoryResolve';
import { getBookingsByIds, searchBookings } from '@/lib/bookings';
import {
    CommissionSchemeId,
    prepareCommissionData,
    calculateBookingCommission,
    isOtaCommission,
    isCoAgentCommission,
    getNightsInMonth,
    type CommissionStep,
    type CommissionStepLineItem,
} from '@/lib/commissionCalculation';
import { Expense, Income, Booking, AccountancyCategory } from '@/lib/types';
import { buildCommissionOwnerViewPayload, COMMISSION_OWNER_VIEW_KEY } from '@/lib/commissionOwnerView';

const COMMISSION_FILTERS_KEY = 'accountancy-commission-filters';

function stableUnitLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

function normalizeCommissionRoomFromStorage(
    raw: unknown,
    rooms: { id: number; name?: string }[]
): string | 'all' {
    if (raw === 'all' || raw === null || raw === undefined || raw === '') return 'all';
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        const row = rooms.find((r) => r.id === raw);
        return row ? stableUnitLabel(row) : 'all';
    }
    const s = String(raw);
    if (/^\d+$/.test(s)) {
        const row = rooms.find((r) => r.id === Number(s));
        return row ? stableUnitLabel(row) : 'all';
    }
    return s;
}

function loadCommissionFiltersPayload(): {
    selectedObjectId: number | '';
    roomRaw: unknown;
    selectedMonth: string;
} | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(COMMISSION_FILTERS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const oid = parsed.selectedObjectId;
        let selectedObjectId: number | '' = '';
        if (oid !== null && oid !== undefined && oid !== '') {
            const n = Number(oid);
            selectedObjectId = Number.isFinite(n) ? n : '';
        }
        return {
            selectedObjectId,
            roomRaw: parsed.selectedRoomId,
            selectedMonth: String(parsed.selectedMonth ?? ''),
        };
    } catch {
        return null;
    }
}

function saveCommissionFilters(state: {
    selectedObjectId: number | '';
    selectedRoomId: string | 'all';
    selectedMonth: string;
}) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(COMMISSION_FILTERS_KEY, JSON.stringify(state));
    } catch {
        // ignore
    }
}

const DEFAULT_SCHEME_ID: CommissionSchemeId = 2;

function formatAmount(value: number): string {
    return value.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function lineTotal(quantity: number | undefined, amount: number | undefined): number {
    return (quantity ?? 1) * (amount ?? 0);
}

function monthOverlapIsoRange(monthKey: string): { overlapFrom: string; overlapTo: string } {
    const [y, m] = monthKey.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
        return { overlapFrom: `${monthKey}-01`, overlapTo: `${monthKey}-28` };
    }
    const last = new Date(y, m, 0).getDate();
    return {
        overlapFrom: `${y}-${String(m).padStart(2, '0')}-01`,
        overlapTo: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    };
}

function bookingMatchesSelection(
    b: Booking,
    bookingPropertyId: number,
    roomFilter: string | 'all',
    roomsForObject: { id: number; name?: string }[]
): boolean {
    if (b.propertyId !== bookingPropertyId) return false;
    if (roomFilter === 'all') return true;
    const row = roomsForObject.find((r) => stableUnitLabel(r) === roomFilter);
    return row != null && b.unitId === row.id;
}

function guestCountLabel(b: Booking): string {
    const a = b.numAdult;
    const c = b.numChild;
    if (a == null && c == null) return '—';
    return String((a ?? 0) + (c ?? 0));
}

export default function Page() {
    const router = useRouter();
    const { t, language } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);
    const categoryNameById = useMemo(() => buildCategoryNameByIdMap(categories), [categories]);
    const transactionCategoryName = (record: Expense | Income) =>
        resolveCategoryName(record, categoryNameById);
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);

    const commissionFiltersLoadedRef = useRef(false);

    const [filtersHydrated, setFiltersHydrated] = useState(false);
    const [selectedObjectId, setSelectedObjectId] = useState<number | ''>('');
    const [selectedRoomId, setSelectedRoomId] = useState<string | 'all'>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('');

    const [result, setResult] = useState<{
        reportTitle: string;
        monthKey: string;
        bookingsReport: Array<{
            booking: Booking;
            calculation: ReturnType<typeof calculateBookingCommission>;
            incomes: Income[];
            expenses: Expense[];
        }>;
        unlinkedIncomes: Income[];
        unlinkedExpenses: Expense[];
        totalCommission: number;
        unlinkedExpensesAmount: number;
        totalWithUnlinkedExpenses: number;
        totalIncome: number;
        totalExpenses: number;
        totalLinkedIncome: number;
        totalLinkedExpense: number;
        totalUnlinkedIncome: number;
        totalUnlinkedExpense: number;
    } | null>(null);

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (commissionFiltersLoadedRef.current) return;
        const s = loadCommissionFiltersPayload();
        if (!s) {
            commissionFiltersLoadedRef.current = true;
            setFiltersHydrated(true);
            return;
        }
        if (objects.length === 0) return;

        setSelectedObjectId(s.selectedObjectId);
        setSelectedMonth(s.selectedMonth);
        const obj = s.selectedObjectId ? objects.find((o) => o.id === s.selectedObjectId) : undefined;
        const rooms = obj?.roomTypes ?? [];
        setSelectedRoomId(normalizeCommissionRoomFromStorage(s.roomRaw, rooms));
        commissionFiltersLoadedRef.current = true;
        setFiltersHydrated(true);
    }, [objects]);

    useEffect(() => {
        if (!filtersHydrated) return;
        saveCommissionFilters({
            selectedObjectId,
            selectedRoomId,
            selectedMonth,
        });
    }, [filtersHydrated, selectedObjectId, selectedRoomId, selectedMonth]);

    const selectedObject = selectedObjectId
        ? objects.find((o) => o.id === selectedObjectId)
        : null;
    const roomsForObject = selectedObject?.roomTypes ?? [];

    useEffect(() => {
        if (!hasAccess) return;

        const load = async () => {
            setLoading(true);
            try {
                const [exp, inc, cats] = await Promise.all([
                    getExpenses(),
                    getIncomes(),
                    getAccountancyCategories(),
                ]);
                setExpenses(exp);
                setIncomes(inc);
                setCategories(cats);
            } catch (err) {
                console.error('Error loading data:', err);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [hasAccess]);

    const handleCalculate = async () => {
        if (!selectedObjectId || !selectedMonth) return;

        setCalculating(true);
        setResult(null);

        try {
            const roomFilter: string | 'all' = selectedRoomId;
            const bookingPropertyId =
                selectedObject?.propertyId ??
                (typeof selectedObjectId === 'number' ? selectedObjectId : 0);

            const [y, m] = selectedMonth.split('-').map(Number);
            const dateInMonth = (d: Date | string) => {
                const date = new Date(d);
                return date.getFullYear() === y && date.getMonth() === m - 1;
            };
            const matchRoom = (roomName: string | null | undefined) =>
                roomFilter === 'all' || (roomName != null && roomName !== '' && roomName === roomFilter);

            const { overlapFrom, overlapTo } = monthOverlapIsoRange(selectedMonth);
            const roomRow =
                roomFilter === 'all' ? undefined : roomsForObject.find((r) => stableUnitLabel(r) === roomFilter);

            const overlapBookings = await searchBookings({
                objectId: bookingPropertyId,
                ...(roomRow != null ? { roomId: roomRow.id } : {}),
                overlapFrom,
                overlapTo,
            });

            const overlapFiltered = overlapBookings.filter((b) =>
                bookingMatchesSelection(b, bookingPropertyId, roomFilter, roomsForObject)
            );

            const txnBookingIds = new Set<number>();
            for (const i of incomes) {
                if (i.objectId !== selectedObjectId || !dateInMonth(i.date) || !matchRoom(i.roomName ?? null))
                    continue;
                if (i.bookingId != null) txnBookingIds.add(i.bookingId);
            }
            for (const e of expenses) {
                if (e.objectId !== selectedObjectId || !dateInMonth(e.date) || !matchRoom(e.roomName ?? null))
                    continue;
                if (e.bookingId != null) txnBookingIds.add(e.bookingId);
            }

            const missingFromOverlap = [...txnBookingIds].filter(
                (id) => !overlapFiltered.some((b) => b.id === id)
            );
            const extras = missingFromOverlap.length ? await getBookingsByIds(missingFromOverlap) : [];
            const extrasFiltered = extras.filter((b) =>
                bookingMatchesSelection(b, bookingPropertyId, roomFilter, roomsForObject)
            );

            const byId = new Map<number, Booking>();
            for (const b of overlapFiltered) byId.set(b.id, b);
            for (const b of extrasFiltered) byId.set(b.id, b);

            const mergedBookings = Array.from(byId.values()).sort(
                (a, c) => new Date(a.arrival).getTime() - new Date(c.arrival).getTime()
            );

            const inputs = prepareCommissionData(
                mergedBookings,
                incomes,
                expenses,
                categories,
                selectedObjectId,
                roomFilter,
                selectedMonth,
                bookingPropertyId,
                roomsForObject
            );

            const getSchemeForBooking = (booking: Booking): CommissionSchemeId => {
                const room = roomsForObject.find((r) => r.id === booking.unitId);
                const scheme = room?.commissionSchemeId;
                return (scheme && scheme >= 1 && scheme <= 4 ? scheme : DEFAULT_SCHEME_ID) as CommissionSchemeId;
            };

            const results = inputs.map((input) =>
                calculateBookingCommission(input, getSchemeForBooking(input.booking))
            );

            const unlinkedIncomes = incomes.filter(
                (i) =>
                    i.objectId === selectedObjectId &&
                    i.bookingId == null &&
                    dateInMonth(i.date) &&
                    matchRoom(i.roomName ?? null)
            );
            const unlinkedExpenses = expenses.filter(
                (e) =>
                    e.objectId === selectedObjectId &&
                    e.bookingId == null &&
                    dateInMonth(e.date) &&
                    matchRoom(e.roomName ?? null)
            );

            const bookingsReport = mergedBookings.map((booking, idx) => {
                const calculation = results[idx]!;
                const incomesRows = incomes.filter(
                    (i) =>
                        i.objectId === selectedObjectId &&
                        i.bookingId === booking.id &&
                        dateInMonth(i.date) &&
                        matchRoom(i.roomName ?? null)
                );
                const expensesRows = expenses.filter(
                    (e) =>
                        e.objectId === selectedObjectId &&
                        e.bookingId === booking.id &&
                        dateInMonth(e.date) &&
                        matchRoom(e.roomName ?? null)
                );
                return { booking, calculation, incomes: incomesRows, expenses: expensesRows };
            });

            const reportTitle =
                roomFilter === 'all' ? selectedObject?.name ?? '' : `${selectedObject?.name ?? ''} — ${roomFilter}`;

            const commissionFromBookings = results.reduce((s, r) => s + r.commission, 0);
            const unlinkedExpensesAmount = unlinkedExpenses.reduce((s, e) => s + lineTotal(e.quantity, e.amount), 0);
            const totalCommission = commissionFromBookings;
            const totalWithUnlinkedExpenses = totalCommission + unlinkedExpensesAmount;

            const totalUnlinkedIncome = unlinkedIncomes.reduce((s, i) => s + lineTotal(i.quantity, i.amount), 0);
            const totalUnlinkedExpense = unlinkedExpensesAmount;

            const totalLinkedIncome = results.reduce((s, r) => s + r.income, 0);
            const totalLinkedExpense = results.reduce((s, r) => s + r.totalExpenses, 0);

            const totalIncome = totalLinkedIncome + totalUnlinkedIncome;
            const totalExpenses = totalLinkedExpense + totalUnlinkedExpense;

            setResult({
                reportTitle,
                monthKey: selectedMonth,
                bookingsReport,
                unlinkedIncomes,
                unlinkedExpenses,
                totalCommission,
                unlinkedExpensesAmount,
                totalWithUnlinkedExpenses,
                totalIncome,
                totalExpenses,
                totalLinkedIncome,
                totalLinkedExpense,
                totalUnlinkedIncome,
                totalUnlinkedExpense,
            });
        } catch (err) {
            console.error('Commission calculation error:', err);
        } finally {
            setCalculating(false);
        }
    };

    const monthOptions = (() => {
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
        return options;
    })();

    const locale = language === 'en' ? 'en-US' : 'ru-RU';

    const formatStatus = (status: string) =>
        status === 'confirmed' ? t('accountancy.statusConfirmed') : t('accountancy.statusDraft');

    const renderLineItemsTable = (items: CommissionStepLineItem[] | undefined) => {
        if (!items || items.length === 0) {
            return (
                <Typography variant="caption" color="text.secondary">
                    {t('accountancy.commission.stepNoTransactions')}
                </Typography>
            );
        }
        return (
            <Table size="small" sx={{ bgcolor: 'action.hover' }}>
                <TableHead>
                    <TableRow>
                        <TableCell>{t('accountancy.dateColumn')}</TableCell>
                        <TableCell>{t('accountancy.transactionTypeColumn')}</TableCell>
                        <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                        <TableCell align="right">{t('accountancy.commission.lineTotal')}</TableCell>
                        <TableCell>{t('accountancy.comment')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.map((row) => {
                        const key = row.id ?? `${row.kind}-${row.date}-${row.category}-${row.amount}`;
                        return (
                            <TableRow key={key}>
                                <TableCell>{new Date(row.date).toLocaleDateString(locale)}</TableCell>
                                <TableCell>
                                    {row.kind === 'income'
                                        ? t('accountancy.income')
                                        : t('accountancy.expense')}
                                </TableCell>
                                <TableCell>{row.category}</TableCell>
                                <TableCell align="right">{formatAmount(row.amount)}</TableCell>
                                <TableCell sx={{ maxWidth: 220, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                    {row.comment ?? '—'}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        );
    };

    const renderCommissionSteps = (steps: CommissionStep[]) => (
        <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
            <Table size="small">
                <TableHead>
                    <TableRow sx={{ bgcolor: 'action.selected' }}>
                        <TableCell>{t('accountancy.commission.stepColumn')}</TableCell>
                        <TableCell align="right">{t('accountancy.commission.valueColumn')}</TableCell>
                        <TableCell sx={{ minWidth: 160 }}>{t('accountancy.commission.formulaColumn')}</TableCell>
                        <TableCell>{t('accountancy.commission.detailLines')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {steps.map((step, idx) => (
                        <TableRow key={idx}>
                            <TableCell sx={{ verticalAlign: 'top' }}>
                                <Stack spacing={0.5}>
                                    <Typography variant="body2">{step.description}</Typography>
                                    {step.nightBooking && (
                                        <Typography variant="caption" color="text.secondary">
                                            {t('accountancy.cashflow.bookingArrival')}:{' '}
                                            {new Date(step.nightBooking.arrival).toLocaleDateString(locale)};{' '}
                                            {t('accountancy.cashflow.bookingDeparture')}:{' '}
                                            {new Date(step.nightBooking.departure).toLocaleDateString(locale)}
                                        </Typography>
                                    )}
                                </Stack>
                            </TableCell>
                            <TableCell align="right" sx={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                {step.value !== undefined
                                    ? typeof step.value === 'number'
                                        ? formatAmount(step.value)
                                        : step.value
                                    : '—'}
                            </TableCell>
                            <TableCell sx={{ verticalAlign: 'top' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                                    {step.formula ?? '—'}
                                </Typography>
                            </TableCell>
                            <TableCell sx={{ verticalAlign: 'top', p: 1 }}>
                                {step.lineItems !== undefined ? (
                                    renderLineItemsTable(step.lineItems)
                                ) : step.nightBooking ? (
                                    <Typography variant="caption" color="text.secondary">
                                        {t('accountancy.commission.nightsBookingNote')}
                                    </Typography>
                                ) : (
                                    '—'
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.commission.title')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('accountancy.commission.title')}
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                {t('accountancy.commission.description')}
            </Typography>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    {t('accountancy.commission.params')}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap" useFlexGap>
                    <FormControl sx={{ minWidth: 200 }} size="small">
                        <InputLabel>{t('common.object')}</InputLabel>
                        <Select
                            label={t('common.object')}
                            value={selectedObjectId === '' ? '' : String(selectedObjectId)}
                            onChange={(e) => {
                                const v = e.target.value;
                                setSelectedObjectId(v ? Number(v) : '');
                                setSelectedRoomId('all');
                                setResult(null);
                            }}
                        >
                            <MenuItem value="">
                                <em>{t('accountancy.commission.selectObject')}</em>
                            </MenuItem>
                            {objects.map((obj) => (
                                <MenuItem key={`${obj.propertyName || 'obj'}-${obj.id}`} value={String(obj.id)}>
                                    {obj.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl
                        sx={{ minWidth: 200 }}
                        size="small"
                        disabled={!selectedObject}
                    >
                        <InputLabel>{t('common.room')}</InputLabel>
                        <Select
                            label={t('common.room')}
                            value={selectedRoomId === 'all' ? 'all' : selectedRoomId}
                            onChange={(e) => {
                                const v = e.target.value;
                                setSelectedRoomId(v === 'all' ? 'all' : String(v));
                                setResult(null);
                            }}
                        >
                            <MenuItem value="all">{t('accountancy.all')}</MenuItem>
                            {roomsForObject.map((room) => (
                                <MenuItem key={room.id} value={stableUnitLabel(room)}>
                                    {room.name || `Room ${room.id}`}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl sx={{ minWidth: 200 }} size="small">
                        <InputLabel>{t('accountancy.selectMonth')}</InputLabel>
                        <Select
                            label={t('accountancy.selectMonth')}
                            value={selectedMonth}
                            onChange={(e) => {
                                setSelectedMonth(e.target.value as string);
                                setResult(null);
                            }}
                        >
                            <MenuItem value="">
                                <em>{t('accountancy.commission.selectMonth')}</em>
                            </MenuItem>
                            {monthOptions.map((o) => (
                                <MenuItem key={o.value} value={o.value}>
                                    {o.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Button
                        variant="contained"
                        startIcon={
                            calculating ? (
                                <CircularProgress size={20} color="inherit" />
                            ) : (
                                <CalculateIcon />
                            )
                        }
                        onClick={handleCalculate}
                        disabled={
                            !selectedObjectId ||
                            !selectedMonth ||
                            calculating
                        }
                    >
                        {t('accountancy.commission.calculate')}
                    </Button>
                </Stack>
            </Paper>

            {result && (
                <Stack spacing={3}>
                    <Paper sx={{ p: 2 }}>
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={2}
                            alignItems={{ xs: 'flex-start', sm: 'center' }}
                            justifyContent="space-between"
                            sx={{ mb: 1 }}
                        >
                            <Typography variant="h5">
                                {result.reportTitle || t('accountancy.commission.result')}
                            </Typography>
                            <Button
                                variant="outlined"
                                startIcon={<VisibilityOutlinedIcon />}
                                onClick={() => {
                                    const payload = buildCommissionOwnerViewPayload(result, locale);
                                    try {
                                        sessionStorage.setItem(
                                            COMMISSION_OWNER_VIEW_KEY,
                                            JSON.stringify(payload)
                                        );
                                    } catch (e) {
                                        console.error('Owner view storage:', e);
                                        return;
                                    }
                                    router.push('/dashboard/accountancy/commission/owner-view');
                                }}
                            >
                                {t('accountancy.commission.viewAsOwner')}
                            </Button>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                            {t('accountancy.selectMonth')}: {result.monthKey}
                        </Typography>
                    </Paper>

                    <Typography variant="h6">{t('accountancy.commission.reportByBookings')}</Typography>

                    {result.bookingsReport.length === 0 &&
                    result.unlinkedIncomes.length === 0 &&
                    result.unlinkedExpenses.length === 0 ? (
                        <Alert severity="info">{t('accountancy.commission.noBookings')}</Alert>
                    ) : null}

                    {result.bookingsReport.length > 0
                        ? result.bookingsReport.map(({ booking, calculation, incomes: incRows, expenses: expRows }) => {
                            const nightsInMonth = getNightsInMonth(
                                booking.arrival,
                                booking.departure,
                                result.monthKey
                            );
                            const roomMeta = roomsForObject.find((r) => r.id === booking.unitId);
                            const roomLabel =
                                roomMeta != null
                                    ? stableUnitLabel(roomMeta)
                                    : booking.unitId != null
                                      ? `Unit ${booking.unitId}`
                                      : '—';
                            const incomeSum = incRows.reduce((s, i) => s + lineTotal(i.quantity, i.amount), 0);
                            const expenseSum = expRows.reduce((s, e) => s + lineTotal(e.quantity, e.amount), 0);
                            const refLabel =
                                booking.refererEditable || booking.referer || booking.channel || '—';

                            return (
                                <Paper key={booking.id} variant="outlined" sx={{ p: 2, overflow: 'hidden' }}>
                                    <Stack
                                        direction={{ xs: 'column', md: 'row' }}
                                        spacing={1}
                                        alignItems={{ xs: 'flex-start', md: 'center' }}
                                        flexWrap="wrap"
                                        useFlexGap
                                        sx={{ mb: 2 }}
                                    >
                                        <Typography variant="subtitle1" fontWeight={700}>
                                            {calculation.bookingTitle}
                                        </Typography>
                                        <Chip size="small" label={`${t('accountancy.commission.bookingIdShort')} ${booking.id}`} />
                                        <Chip
                                            size="small"
                                            color="primary"
                                            variant="outlined"
                                            label={`${t('accountancy.commission.scheme')} ${calculation.schemeId}`}
                                        />
                                        <Typography variant="body2" color="text.secondary">
                                            {t('common.room')}: {roomLabel}
                                        </Typography>
                                    </Stack>

                                    <Table size="small" sx={{ mb: 2, maxWidth: 720 }}>
                                        <TableBody>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600, width: 200 }}>
                                                    {t('accountancy.cashflow.bookingArrival')}
                                                </TableCell>
                                                <TableCell>{new Date(booking.arrival).toLocaleDateString(locale)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600 }}>
                                                    {t('accountancy.cashflow.bookingDeparture')}
                                                </TableCell>
                                                <TableCell>{new Date(booking.departure).toLocaleDateString(locale)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.nightsInMonth')}</TableCell>
                                                <TableCell>{nightsInMonth}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.nightsTotal')}</TableCell>
                                                <TableCell>{calculation.nights}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.referrer')}</TableCell>
                                                <TableCell>{refLabel}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.guestsCount')}</TableCell>
                                                <TableCell>{guestCountLabel(booking)}</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>

                                    <Typography
                                        variant="subtitle2"
                                        fontWeight={700}
                                        sx={{ mb: 1, color: 'success.dark', bgcolor: 'success.50', px: 1, py: 0.5, borderRadius: 0.5 }}
                                    >
                                        {t('accountancy.commission.incomesSection')}
                                    </Typography>
                                    <TableContainer sx={{ mb: 2, maxWidth: '100%', overflowX: 'auto' }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                                    <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                                    <TableCell align="right">{t('accountancy.quantity')}</TableCell>
                                                    <TableCell align="right">{t('accountancy.commission.unitPrice')}</TableCell>
                                                    <TableCell align="right">{t('accountancy.commission.lineTotal')}</TableCell>
                                                    <TableCell>{t('common.room')}</TableCell>
                                                    <TableCell>{t('accountancy.status')}</TableCell>
                                                    <TableCell>{t('accountancy.comment')}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {incRows.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={8}>
                                                            <Typography variant="body2" color="text.secondary">
                                                                {t('accountancy.commission.noIncomes')}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    incRows.map((i) => {
                                                        const sum = lineTotal(i.quantity, i.amount);
                                                        return (
                                                            <TableRow key={i._id ?? `${i.date}-${i.category}-${sum}`}>
                                                                <TableCell>{new Date(i.date).toLocaleDateString(locale)}</TableCell>
                                                                <TableCell>{transactionCategoryName(i)}</TableCell>
                                                                <TableCell align="right">{i.quantity ?? 1}</TableCell>
                                                                <TableCell align="right">{formatAmount(i.amount ?? 0)}</TableCell>
                                                                <TableCell align="right">{formatAmount(sum)}</TableCell>
                                                                <TableCell>{i.roomName ?? '—'}</TableCell>
                                                                <TableCell>{formatStatus(i.status)}</TableCell>
                                                                <TableCell sx={{ maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                                                    {i.comment ?? '—'}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })
                                                )}
                                                {incRows.length > 0 && (
                                                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                                                        <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>
                                                            {t('accountancy.commission.sum')}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                                            {formatAmount(incomeSum)}
                                                        </TableCell>
                                                        <TableCell colSpan={3} />
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>

                                    <Typography
                                        variant="subtitle2"
                                        fontWeight={700}
                                        sx={{ mb: 1, color: 'warning.dark', bgcolor: 'warning.50', px: 1, py: 0.5, borderRadius: 0.5 }}
                                    >
                                        {t('accountancy.commission.expensesSection')}
                                    </Typography>
                                    <TableContainer sx={{ mb: 2, maxWidth: '100%', overflowX: 'auto' }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                                    <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                                    <TableCell align="right">{t('accountancy.quantity')}</TableCell>
                                                    <TableCell align="right">{t('accountancy.commission.unitPrice')}</TableCell>
                                                    <TableCell align="right">{t('accountancy.commission.lineTotal')}</TableCell>
                                                    <TableCell>{t('accountancy.commission.colOta')}</TableCell>
                                                    <TableCell>{t('accountancy.commission.colCoAgent')}</TableCell>
                                                    <TableCell>{t('common.room')}</TableCell>
                                                    <TableCell>{t('accountancy.status')}</TableCell>
                                                    <TableCell>{t('accountancy.comment')}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {expRows.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={10}>
                                                            <Typography variant="body2" color="text.secondary">
                                                                {t('accountancy.noExpenses')}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    expRows.map((e) => {
                                                        const sum = lineTotal(e.quantity, e.amount);
                                                        return (
                                                            <TableRow key={e._id ?? `${e.date}-${e.category}-${sum}`}>
                                                                <TableCell>{new Date(e.date).toLocaleDateString(locale)}</TableCell>
                                                                <TableCell>{transactionCategoryName(e)}</TableCell>
                                                                <TableCell align="right">{e.quantity ?? 1}</TableCell>
                                                                <TableCell align="right">{formatAmount(e.amount ?? 0)}</TableCell>
                                                                <TableCell align="right">{formatAmount(sum)}</TableCell>
                                                                <TableCell>{isOtaCommission(transactionCategoryName(e)) ? '✓' : ''}</TableCell>
                                                                <TableCell>{isCoAgentCommission(transactionCategoryName(e)) ? '✓' : ''}</TableCell>
                                                                <TableCell>{e.roomName ?? '—'}</TableCell>
                                                                <TableCell>{formatStatus(e.status)}</TableCell>
                                                                <TableCell sx={{ maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                                                    {e.comment ?? '—'}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })
                                                )}
                                                {expRows.length > 0 && (
                                                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                                                        <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>
                                                            {t('accountancy.commission.sum')}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                                            {formatAmount(expenseSum)}
                                                        </TableCell>
                                                        <TableCell colSpan={5} />
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>

                                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                                        {t('accountancy.commission.commissionStepsSection')}
                                    </Typography>
                                    {renderCommissionSteps(calculation.steps)}

                                    <Divider sx={{ my: 2 }} />

                                    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <Typography variant="body1" fontWeight={700}>
                                            {t('accountancy.commission.commissionAmount')}:
                                        </Typography>
                                        <Typography variant="h6" component="span" color="primary">
                                            {formatAmount(calculation.commission)}
                                        </Typography>
                                    </Stack>
                                </Paper>
                            );
                        })
                        : null}

                    {(result.unlinkedIncomes.length > 0 || result.unlinkedExpenses.length > 0) && (
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="h6" sx={{ mb: 2 }}>
                                {t('accountancy.commission.unlinkedSection')}
                            </Typography>

                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                {t('accountancy.commission.unlinkedIncomes')}
                            </Typography>
                            <TableContainer sx={{ mb: 2, maxWidth: '100%', overflowX: 'auto' }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                            <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                            <TableCell align="right">{t('accountancy.quantity')}</TableCell>
                                            <TableCell align="right">{t('accountancy.commission.unitPrice')}</TableCell>
                                            <TableCell align="right">{t('accountancy.commission.lineTotal')}</TableCell>
                                            <TableCell>{t('common.room')}</TableCell>
                                            <TableCell>{t('accountancy.status')}</TableCell>
                                            <TableCell>{t('accountancy.comment')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {result.unlinkedIncomes.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8}>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {t('accountancy.commission.noIncomes')}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            result.unlinkedIncomes.map((i) => {
                                                const sum = lineTotal(i.quantity, i.amount);
                                                return (
                                                    <TableRow key={i._id ?? `${i.date}-${i.category}`}>
                                                        <TableCell>{new Date(i.date).toLocaleDateString(locale)}</TableCell>
                                                        <TableCell>{transactionCategoryName(i)}</TableCell>
                                                        <TableCell align="right">{i.quantity ?? 1}</TableCell>
                                                        <TableCell align="right">{formatAmount(i.amount ?? 0)}</TableCell>
                                                        <TableCell align="right">{formatAmount(sum)}</TableCell>
                                                        <TableCell>{i.roomName ?? '—'}</TableCell>
                                                        <TableCell>{formatStatus(i.status)}</TableCell>
                                                        <TableCell sx={{ maxWidth: 200, whiteSpace: 'normal' }}>
                                                            {i.comment ?? '—'}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                {t('accountancy.commission.unlinkedExpenses')}
                            </Typography>
                            <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                            <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                            <TableCell align="right">{t('accountancy.quantity')}</TableCell>
                                            <TableCell align="right">{t('accountancy.commission.unitPrice')}</TableCell>
                                            <TableCell align="right">{t('accountancy.commission.lineTotal')}</TableCell>
                                            <TableCell>{t('common.room')}</TableCell>
                                            <TableCell>{t('accountancy.status')}</TableCell>
                                            <TableCell>{t('accountancy.comment')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {result.unlinkedExpenses.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8}>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {t('accountancy.noExpenses')}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            result.unlinkedExpenses.map((e) => {
                                                const sum = lineTotal(e.quantity, e.amount);
                                                return (
                                                    <TableRow key={e._id ?? `${e.date}-${e.category}`}>
                                                        <TableCell>{new Date(e.date).toLocaleDateString(locale)}</TableCell>
                                                        <TableCell>{transactionCategoryName(e)}</TableCell>
                                                        <TableCell align="right">{e.quantity ?? 1}</TableCell>
                                                        <TableCell align="right">{formatAmount(e.amount ?? 0)}</TableCell>
                                                        <TableCell align="right">{formatAmount(sum)}</TableCell>
                                                        <TableCell>{e.roomName ?? '—'}</TableCell>
                                                        <TableCell>{formatStatus(e.status)}</TableCell>
                                                        <TableCell sx={{ maxWidth: 200, whiteSpace: 'normal' }}>
                                                            {e.comment ?? '—'}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    )}

                    <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            {t('accountancy.commission.grandTotals')}
                        </Typography>
                        <Table size="small" sx={{ maxWidth: 560 }}>
                            <TableBody>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.totalLinkedIncome')}</TableCell>
                                    <TableCell align="right">{formatAmount(result.totalLinkedIncome)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.totalUnlinkedIncome')}</TableCell>
                                    <TableCell align="right">{formatAmount(result.totalUnlinkedIncome)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.totalIncome')}</TableCell>
                                    <TableCell align="right">{formatAmount(result.totalIncome)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell colSpan={2}>
                                        <Divider sx={{ my: 1 }} />
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.totalLinkedExpense')}</TableCell>
                                    <TableCell align="right">{formatAmount(result.totalLinkedExpense)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.totalUnlinkedExpense')}</TableCell>
                                    <TableCell align="right">{formatAmount(result.totalUnlinkedExpense)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.totalExpenses')}</TableCell>
                                    <TableCell align="right">{formatAmount(result.totalExpenses)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell colSpan={2}>
                                        <Divider sx={{ my: 1 }} />
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.totalCommission')}</TableCell>
                                    <TableCell align="right">{formatAmount(result.totalCommission)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>{t('accountancy.commission.unlinkedExpenses')}</TableCell>
                                    <TableCell align="right">{formatAmount(result.unlinkedExpensesAmount)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('accountancy.commission.totalWithUnlinkedExpenses')}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                        {formatAmount(result.totalWithUnlinkedExpenses)}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </Paper>

                    <Accordion elevation={0} variant="outlined" sx={{ '&:before': { display: 'none' } }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography fontWeight={600}>{t('accountancy.commission.schemesHelp')}</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Stack spacing={0.5}>
                                <Typography variant="body2" color="text.secondary">
                                    <strong>{t('accountancy.commission.scheme1')}:</strong>{' '}
                                    {t('accountancy.commission.scheme1Desc')}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    <strong>{t('accountancy.commission.scheme2')}:</strong>{' '}
                                    {t('accountancy.commission.scheme2Desc')}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    <strong>{t('accountancy.commission.scheme3')}:</strong>{' '}
                                    {t('accountancy.commission.scheme3Desc')}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    <strong>{t('accountancy.commission.scheme4')}:</strong>{' '}
                                    {t('accountancy.commission.scheme4Desc')}
                                </Typography>
                            </Stack>
                        </AccordionDetails>
                    </Accordion>
                </Stack>
            )}
        </Box>
    );
}

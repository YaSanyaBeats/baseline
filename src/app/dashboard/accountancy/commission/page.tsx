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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalculateIcon from '@mui/icons-material/Calculate';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';
import { getExpenses } from '@/lib/expenses';
import { getIncomes } from '@/lib/incomes';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { getBookingsByIds } from '@/lib/bookings';
import {
    CommissionSchemeId,
    prepareCommissionData,
    calculateBookingCommission,
    isOtaCommission,
    isCoAgentCommission,
    type CommissionStep,
} from '@/lib/commissionCalculation';
import { Expense, Income, Booking, AccountancyCategory } from '@/lib/types';

const COMMISSION_FILTERS_KEY = 'accountancy-commission-filters';

function stableUnitLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

/** Локально в фильтре комиссии храним стабильное имя юнита; legacy: числовой unit id в LS. */
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

function CommissionCalculationStepBlock({
    step,
    stepIndex,
    t,
    language,
    formatAmount: fmt,
}: {
    step: CommissionStep;
    stepIndex: number;
    t: (key: string) => string;
    language: string;
    formatAmount: (n: number) => string;
}) {
    const locale = language === 'en' ? 'en-US' : 'ru-RU';
    const hasTransactionBreakdown = step.lineItems !== undefined;
    const hasNightBreakdown = Boolean(step.nightBooking);
    const showExpandable = hasTransactionBreakdown || hasNightBreakdown;

    const valueNode =
        step.value !== undefined ? (
            <Typography variant="body2" fontWeight={500} component="span">
                {typeof step.value === 'number' ? fmt(step.value) : step.value}
            </Typography>
        ) : null;

    if (!showExpandable) {
        return (
            <Box
                key={stepIndex}
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1,
                }}
            >
                <Typography variant="body2">{step.description}</Typography>
                {valueNode}
                {step.formula && (
                    <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>
                        {step.formula}
                    </Typography>
                )}
            </Box>
        );
    }

    return (
        <Accordion
            key={stepIndex}
            elevation={0}
            variant="outlined"
            disableGutters
            sx={{ '&:before': { display: 'none' } }}
        >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                        pr: 1,
                        gap: 1,
                    }}
                >
                    <Typography variant="body2">{step.description}</Typography>
                    {valueNode}
                </Box>
            </AccordionSummary>
            <AccordionDetails>
                <Stack spacing={1.5}>
                    {step.formula && (
                        <Typography variant="caption" color="text.secondary">
                            {step.formula}
                        </Typography>
                    )}
                    {step.nightBooking && (
                        <>
                            <Table size="small">
                                <TableBody>
                                    <TableRow>
                                        <TableCell sx={{ borderBottom: 'none', pl: 0, py: 0.5 }}>
                                            {t('accountancy.cashflow.bookingArrival')}
                                        </TableCell>
                                        <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5 }}>
                                            {new Date(step.nightBooking.arrival).toLocaleDateString(locale)}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell sx={{ borderBottom: 'none', pl: 0, py: 0.5 }}>
                                            {t('accountancy.cashflow.bookingDeparture')}
                                        </TableCell>
                                        <TableCell align="right" sx={{ borderBottom: 'none', py: 0.5 }}>
                                            {new Date(step.nightBooking.departure).toLocaleDateString(locale)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                            <Typography variant="caption" color="text.secondary">
                                {t('accountancy.commission.nightsBookingNote')}
                            </Typography>
                        </>
                    )}
                    {step.lineItems !== undefined &&
                        (step.lineItems.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                {t('accountancy.commission.stepNoTransactions')}
                            </Typography>
                        ) : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                        <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                        <TableCell align="right">{t('accountancy.amountColumn')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {step.lineItems.map((row) => {
                                        const key = row.id ?? `${row.kind}-${row.date}-${row.category}-${row.amount}`;
                                        return (
                                            <TableRow key={key}>
                                                <TableCell>
                                                    {new Date(row.date).toLocaleDateString(locale)}
                                                </TableCell>
                                                <TableCell>{row.category}</TableCell>
                                                <TableCell align="right">{fmt(row.amount)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        ))}
                </Stack>
            </AccordionDetails>
        </Accordion>
    );
}

export default function Page() {
    const { t, language } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);

    const commissionFiltersLoadedRef = useRef(false);

    const [filtersHydrated, setFiltersHydrated] = useState(false);
    const [selectedObjectId, setSelectedObjectId] = useState<number | ''>('');
    const [selectedRoomId, setSelectedRoomId] = useState<string | 'all'>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('');

    const [result, setResult] = useState<{
        reportTitle: string;
        linkedIncomes: Income[];
        otaExpenses: Expense[];
        coAgentExpenses: Expense[];
        bookings: Array<ReturnType<typeof calculateBookingCommission>>;
        totalCommission: number;
        unlinkedExpensesAmount: number;
        totalWithUnlinkedExpenses: number;
        totalIncome: number;
        totalExpenses: number;
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

    const getBookingIdsFromExpensesAndIncomes = (
        objectId: number,
        monthKey: string
    ): number[] => {
        const [y, m] = monthKey.split('-').map(Number);
        const dateInMonth = (d: Date | string) => {
            const date = new Date(d);
            return date.getFullYear() === y && date.getMonth() === m - 1;
        };
        const ids = new Set<number>();
        expenses
            .filter(
                (e) =>
                    e.objectId === objectId &&
                    e.bookingId != null &&
                    dateInMonth(e.date)
            )
            .forEach((e) => ids.add(e.bookingId!));
        incomes
            .filter(
                (i) =>
                    i.objectId === objectId &&
                    i.bookingId != null &&
                    dateInMonth(i.date)
            )
            .forEach((i) => ids.add(i.bookingId!));
        return Array.from(ids);
    };

    const handleCalculate = async () => {
        if (!selectedObjectId || !selectedMonth) return;

        setCalculating(true);
        setResult(null);

        try {
            const roomFilter: string | 'all' = selectedRoomId;
            const bookingPropertyId =
                selectedObject?.propertyId ??
                (typeof selectedObjectId === 'number' ? selectedObjectId : 0);
            const bookingIds = getBookingIdsFromExpensesAndIncomes(
                selectedObjectId,
                selectedMonth
            );
            const bookingsList = await getBookingsByIds(bookingIds);
            const filteredBookings = bookingsList.filter((b) => {
                if (b.propertyId !== bookingPropertyId) return false;
                if (roomFilter === 'all') return true;
                const row = roomsForObject.find((r) => stableUnitLabel(r) === roomFilter);
                return row != null && b.unitId === row.id;
            });
            setBookings(filteredBookings);

            const inputs = prepareCommissionData(
                filteredBookings,
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

            const [y, m] = selectedMonth.split('-').map(Number);
            const dateInMonth = (d: Date | string) => {
                const date = new Date(d);
                return date.getFullYear() === y && date.getMonth() === m - 1;
            };
            const matchRoom = (roomName: string | null | undefined) =>
                roomFilter === 'all' || (roomName != null && roomName !== '' && roomName === roomFilter);

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

            const bookingIdsSet = new Set(filteredBookings.map((b) => b.id));
            const linkedIncomesList = incomes.filter(
                (i) =>
                    i.objectId === selectedObjectId &&
                    i.bookingId != null &&
                    bookingIdsSet.has(i.bookingId) &&
                    dateInMonth(i.date)
            );
            const linkedExpensesList = expenses.filter(
                (e) =>
                    e.objectId === selectedObjectId &&
                    e.bookingId != null &&
                    bookingIdsSet.has(e.bookingId) &&
                    dateInMonth(e.date)
            );
            const otaExpensesList = linkedExpensesList.filter((e) => isOtaCommission(e.category));
            const coAgentExpensesList = linkedExpensesList.filter((e) => isCoAgentCommission(e.category));

            const reportTitle =
                roomFilter === 'all' ? selectedObject?.name ?? '' : `${selectedObject?.name ?? ''} — ${roomFilter}`;

            const commissionFromBookings = results.reduce((s, r) => s + r.commission, 0);
            const unlinkedExpensesAmount = unlinkedExpenses.reduce((s, e) => s + (e.quantity ?? 1) * (e.amount ?? 0), 0);
            const incomeFromBookings = results.reduce((s, r) => s + r.income, 0);
            const expensesFromBookings = results.reduce((s, r) => s + r.totalExpenses, 0);

            const totalCommission = commissionFromBookings;
            const totalWithUnlinkedExpenses = totalCommission + unlinkedExpensesAmount;
            const totalIncome =
                incomeFromBookings + unlinkedIncomes.reduce((s, i) => s + (i.quantity ?? 1) * (i.amount ?? 0), 0);
            const totalExpenses = expensesFromBookings + unlinkedExpensesAmount;

            setResult({
                reportTitle,
                linkedIncomes: linkedIncomesList,
                otaExpenses: otaExpensesList,
                coAgentExpenses: coAgentExpensesList,
                bookings: results,
                totalCommission,
                unlinkedExpensesAmount,
                totalWithUnlinkedExpenses,
                totalIncome,
                totalExpenses,
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
                <Paper sx={{ p: 2 }}>
                    <Typography variant="h5" sx={{ mb: 3 }}>
                        {result.reportTitle || t('accountancy.commission.result')}
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                                {t('accountancy.commission.incomesList')}
                            </Typography>
                            {result.linkedIncomes.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    {t('accountancy.commission.noIncomes')}
                                </Typography>
                            ) : (
                                <>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                                <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                                <TableCell align="right">{t('accountancy.amountColumn')}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {result.linkedIncomes.map((i) => {
                                                const sum = (i.quantity ?? 1) * (i.amount ?? 0);
                                                return (
                                                    <TableRow key={i._id ?? `${i.date}-${i.category}-${sum}`}>
                                                        <TableCell>
                                                            {new Date(i.date).toLocaleDateString('ru-RU')}
                                                        </TableCell>
                                                        <TableCell>{i.category}</TableCell>
                                                        <TableCell align="right">{formatAmount(sum)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                    <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
                                        {t('accountancy.commission.sum')}:{' '}
                                        {formatAmount(
                                            result.linkedIncomes.reduce(
                                                (s, i) => s + (i.quantity ?? 1) * (i.amount ?? 0),
                                                0
                                            )
                                        )}
                                    </Typography>
                                </>
                            )}
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                                {t('accountancy.commission.bookingsList')}
                            </Typography>
                            {result.bookings.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    {t('accountancy.commission.noBookings')}
                                </Typography>
                            ) : (
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>{t('bookings.title')}</TableCell>
                                            <TableCell align="right">{t('common.nights')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {result.bookings.map((r) => (
                                            <TableRow key={r.bookingId}>
                                                <TableCell>{r.bookingTitle}</TableCell>
                                                <TableCell align="right">{r.nights}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                                {t('accountancy.commission.otaExpensesList')}
                            </Typography>
                            {result.otaExpenses.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    {t('accountancy.commission.noOtaExpenses')}
                                </Typography>
                            ) : (
                                <>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                                <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                                <TableCell align="right">{t('accountancy.amountColumn')}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {result.otaExpenses.map((e) => {
                                                const sum = (e.quantity ?? 1) * (e.amount ?? 0);
                                                return (
                                                    <TableRow key={e._id ?? `${e.date}-${e.category}-${sum}`}>
                                                        <TableCell>
                                                            {new Date(e.date).toLocaleDateString('ru-RU')}
                                                        </TableCell>
                                                        <TableCell>{e.category}</TableCell>
                                                        <TableCell align="right">{formatAmount(sum)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                    <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
                                        {t('accountancy.commission.sum')}:{' '}
                                        {formatAmount(
                                            result.otaExpenses.reduce(
                                                (s, e) => s + (e.quantity ?? 1) * (e.amount ?? 0),
                                                0
                                            )
                                        )}
                                    </Typography>
                                </>
                            )}
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                                {t('accountancy.commission.coAgentExpensesList')}
                            </Typography>
                            {result.coAgentExpenses.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    {t('accountancy.commission.noCoAgentExpenses')}
                                </Typography>
                            ) : (
                                <>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                                <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                                <TableCell align="right">{t('accountancy.amountColumn')}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {result.coAgentExpenses.map((e) => {
                                                const sum = (e.quantity ?? 1) * (e.amount ?? 0);
                                                return (
                                                    <TableRow key={e._id ?? `${e.date}-${e.category}-${sum}`}>
                                                        <TableCell>
                                                            {new Date(e.date).toLocaleDateString('ru-RU')}
                                                        </TableCell>
                                                        <TableCell>{e.category}</TableCell>
                                                        <TableCell align="right">{formatAmount(sum)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                    <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
                                        {t('accountancy.commission.sum')}:{' '}
                                        {formatAmount(
                                            result.coAgentExpenses.reduce(
                                                (s, e) => s + (e.quantity ?? 1) * (e.amount ?? 0),
                                                0
                                            )
                                        )}
                                    </Typography>
                                </>
                            )}
                        </Paper>

                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                                {t('accountancy.commission.schemeDescriptions')}
                            </Typography>
                            <Stack spacing={0.5} sx={{ mb: 2 }}>
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
                            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1, mt: 2 }}>
                                {t('accountancy.commission.calculationBySchemes')}
                            </Typography>
                            {result.bookings.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    {t('accountancy.commission.noBookings')}
                                </Typography>
                            ) : (
                                result.bookings.map((r) => (
                                    <Accordion key={r.bookingId} sx={{ mb: 0.5 }} elevation={0}>
                                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                            <Typography>
                                                {r.bookingTitle} — {t('accountancy.commission.scheme')} #{r.schemeId} —{' '}
                                                {formatAmount(r.commission)}
                                            </Typography>
                                        </AccordionSummary>
                                        <AccordionDetails>
                                            <Stack spacing={1}>
                                                {r.steps.map((step, idx) => (
                                                    <CommissionCalculationStepBlock
                                                        key={idx}
                                                        step={step}
                                                        stepIndex={idx}
                                                        t={t}
                                                        language={language}
                                                        formatAmount={formatAmount}
                                                    />
                                                ))}
                                            </Stack>
                                        </AccordionDetails>
                                    </Accordion>
                                ))
                            )}
                        </Paper>
                    </Box>
                </Paper>
            )}
        </Box>
    );
}

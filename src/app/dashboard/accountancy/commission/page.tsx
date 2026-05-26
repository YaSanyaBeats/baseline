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
import { getUsers } from '@/lib/users';
import { filterObjectsForOwner } from '@/lib/ownerObjectsFilter';
import { calculateCommissionForObject, type ObjectCommissionResult } from '@/lib/commissionForObject';
import {
    isOtaCommission,
    isCoAgentCommission,
    getNightsInMonth,
    type CommissionStep,
    type CommissionStepLineItem,
} from '@/lib/commissionCalculation';
import { Expense, Income, Booking, AccountancyCategory, User } from '@/lib/types';
import { buildCommissionOwnerViewPayload, collectOwnerViewExtraBookingIds, COMMISSION_OWNER_VIEW_KEY } from '@/lib/commissionOwnerView';
import { getBookingsByIds } from '@/lib/bookings';

const COMMISSION_FILTERS_KEY = 'accountancy-commission-filters';

function stableUnitLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

function loadCommissionFiltersPayload(): {
    selectedOwnerId: string;
    selectedMonth: string;
} | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(COMMISSION_FILTERS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            selectedOwnerId: String(parsed.selectedOwnerId ?? ''),
            selectedMonth: String(parsed.selectedMonth ?? ''),
        };
    } catch {
        return null;
    }
}

function saveCommissionFilters(state: {
    selectedOwnerId: string;
    selectedMonth: string;
}) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(COMMISSION_FILTERS_KEY, JSON.stringify(state));
    } catch {
        // ignore
    }
}

function formatAmount(value: number): string {
    return value.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function lineTotal(quantity: number | undefined, amount: number | undefined): number {
    return (quantity ?? 1) * (amount ?? 0);
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
    const [owners, setOwners] = useState<User[]>([]);
    const categoryNameById = useMemo(() => buildCategoryNameByIdMap(categories), [categories]);
    const transactionCategoryName = (record: Expense | Income) =>
        resolveCategoryName(record, categoryNameById);
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);

    const commissionFiltersLoadedRef = useRef(false);

    const [filtersHydrated, setFiltersHydrated] = useState(false);
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState<string>('');

    const [result, setResult] = useState<{
        reportTitle: string;
        monthKey: string;
        objectReports: ObjectCommissionResult[];
        bookingsReport: ObjectCommissionResult['bookingsReport'];
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
        if (s) {
            setSelectedOwnerId(s.selectedOwnerId);
            setSelectedMonth(s.selectedMonth);
        }
        commissionFiltersLoadedRef.current = true;
        setFiltersHydrated(true);
    }, []);

    useEffect(() => {
        if (!filtersHydrated) return;
        saveCommissionFilters({
            selectedOwnerId,
            selectedMonth,
        });
    }, [filtersHydrated, selectedOwnerId, selectedMonth]);

    const selectedOwner = selectedOwnerId
        ? owners.find((o) => o._id === selectedOwnerId)
        : null;

    const ownerObjects = useMemo(() => {
        if (!selectedOwner) return [];
        return filterObjectsForOwner(objects, selectedOwner.objects ?? []);
    }, [selectedOwner, objects]);

    useEffect(() => {
        if (!hasAccess) return;

        const load = async () => {
            setLoading(true);
            try {
                const [exp, inc, cats, usersList] = await Promise.all([
                    getExpenses(),
                    getIncomes(),
                    getAccountancyCategories(),
                    getUsers(),
                ]);
                setExpenses(exp);
                setIncomes(inc);
                setCategories(cats);
                setOwners(usersList.filter((u) => u.role === 'owner'));
            } catch (err) {
                console.error('Error loading data:', err);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [hasAccess]);

    const handleCalculate = async () => {
        if (!selectedOwnerId || !selectedMonth || ownerObjects.length === 0) return;

        setCalculating(true);
        setResult(null);

        try {
            const objectReports = await Promise.all(
                ownerObjects.map((obj) =>
                    calculateCommissionForObject(obj, selectedMonth, incomes, expenses, categories)
                )
            );

            const bookingsReport = objectReports.flatMap((r) => r.bookingsReport);
            const unlinkedIncomes = objectReports.flatMap((r) => r.unlinkedIncomes);
            const unlinkedExpenses = objectReports.flatMap((r) => r.unlinkedExpenses);

            const reportTitle = selectedOwner?.name || selectedOwner?.login || '';

            const totalCommission = objectReports.reduce((s, r) => s + r.totalCommission, 0);
            const unlinkedExpensesAmount = objectReports.reduce((s, r) => s + r.unlinkedExpensesAmount, 0);
            const totalWithUnlinkedExpenses = totalCommission + unlinkedExpensesAmount;
            const totalUnlinkedIncome = objectReports.reduce((s, r) => s + r.totalUnlinkedIncome, 0);
            const totalUnlinkedExpense = unlinkedExpensesAmount;
            const totalLinkedIncome = objectReports.reduce((s, r) => s + r.totalLinkedIncome, 0);
            const totalLinkedExpense = objectReports.reduce((s, r) => s + r.totalLinkedExpense, 0);
            const totalIncome = totalLinkedIncome + totalUnlinkedIncome;
            const totalExpenses = totalLinkedExpense + totalUnlinkedExpense;

            setResult({
                reportTitle,
                monthKey: selectedMonth,
                objectReports,
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
                    <FormControl sx={{ minWidth: 240 }} size="small">
                        <InputLabel>{t('users.owner')}</InputLabel>
                        <Select
                            label={t('users.owner')}
                            value={selectedOwnerId}
                            onChange={(e) => {
                                setSelectedOwnerId(e.target.value as string);
                                setResult(null);
                            }}
                        >
                            <MenuItem value="">
                                <em>{t('accountancy.commission.selectOwner')}</em>
                            </MenuItem>
                            {owners.map((owner) => (
                                <MenuItem key={owner._id} value={owner._id ?? ''}>
                                    {owner.name || owner.login}
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
                            !selectedOwnerId ||
                            !selectedMonth ||
                            ownerObjects.length === 0 ||
                            calculating ||
                            loading
                        }
                    >
                        {t('accountancy.commission.calculate')}
                    </Button>
                </Stack>
                {selectedOwnerId && ownerObjects.length === 0 && !loading && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {t('accountancy.commission.noOwnerObjects')}
                    </Alert>
                )}
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
                                onClick={async () => {
                                    const missingBookingIds = collectOwnerViewExtraBookingIds(
                                        result.objectReports,
                                        result.monthKey,
                                        categoryNameById,
                                        categories,
                                        incomes,
                                        expenses
                                    );
                                    const extraBookings = missingBookingIds.length
                                        ? await getBookingsByIds(missingBookingIds)
                                        : [];
                                    const payload = buildCommissionOwnerViewPayload(
                                        result,
                                        locale,
                                        categoryNameById,
                                        categories,
                                        incomes,
                                        expenses,
                                        extraBookings
                                    );
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

                    {result.objectReports.every(
                        (o) =>
                            o.bookingsReport.length === 0 &&
                            o.unlinkedIncomes.length === 0 &&
                            o.unlinkedExpenses.length === 0
                    ) ? (
                        <Alert severity="info">{t('accountancy.commission.noBookings')}</Alert>
                    ) : null}

                    {result.objectReports.map((objectReport) => {
                        if (
                            objectReport.bookingsReport.length === 0 &&
                            objectReport.unlinkedIncomes.length === 0 &&
                            objectReport.unlinkedExpenses.length === 0
                        ) {
                            return null;
                        }

                        const roomsForObject = objectReport.roomsForObject;

                        return (
                            <Box key={objectReport.objectId}>
                                <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                                    {objectReport.objectName}
                                </Typography>

                                {objectReport.bookingsReport.map(({ booking, calculation, incomes: incRows, expenses: expRows }) => {
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
                                <Paper key={`${objectReport.objectId}-${booking.id}`} variant="outlined" sx={{ p: 2, overflow: 'hidden', mb: 2 }}>
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
                                })}
                            </Box>
                        );
                    })}

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

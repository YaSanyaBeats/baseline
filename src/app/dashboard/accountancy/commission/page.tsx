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
import { useEffect, useState } from 'react';
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
} from '@/lib/commissionCalculation';
import { Expense, Income, Booking, AccountancyCategory } from '@/lib/types';

const SCHEMES: { id: CommissionSchemeId; labelKey: string }[] = [
    { id: 1, labelKey: 'accountancy.commission.scheme1' },
    { id: 2, labelKey: 'accountancy.commission.scheme2' },
    { id: 3, labelKey: 'accountancy.commission.scheme3' },
    { id: 4, labelKey: 'accountancy.commission.scheme4' },
];

function formatAmount(value: number): string {
    return value.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);

    const [selectedObjectId, setSelectedObjectId] = useState<number | ''>('');
    const [selectedRoomId, setSelectedRoomId] = useState<number | 'all'>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('');
    const [selectedSchemeId, setSelectedSchemeId] = useState<CommissionSchemeId>(2);

    const [result, setResult] = useState<{
        bookings: Array<ReturnType<typeof calculateBookingCommission>>;
        totalCommission: number;
        unlinkedExpensesAmount: number;
        totalWithUnlinkedExpenses: number;
        totalIncome: number;
        totalExpenses: number;
    } | null>(null);

    const hasAccess = isAdmin || isAccountant;

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
            const roomFilter: number | 'all' = selectedRoomId;
            const bookingIds = getBookingIdsFromExpensesAndIncomes(
                selectedObjectId,
                selectedMonth
            );
            const bookingsList = await getBookingsByIds(bookingIds);
            const filteredBookings = bookingsList.filter(
                (b) =>
                    b.propertyId === selectedObjectId &&
                    (roomFilter === 'all' || b.unitId === roomFilter)
            );
            setBookings(filteredBookings);

            const inputs = prepareCommissionData(
                filteredBookings,
                incomes,
                expenses,
                categories,
                selectedObjectId,
                roomFilter,
                selectedMonth
            );

            const results = inputs.map((input) =>
                calculateBookingCommission(input, selectedSchemeId)
            );

            const [y, m] = selectedMonth.split('-').map(Number);
            const dateInMonth = (d: Date | string) => {
                const date = new Date(d);
                return date.getFullYear() === y && date.getMonth() === m - 1;
            };
            const matchRoom = (roomId: number | undefined) =>
                roomFilter === 'all' || roomId === roomFilter;

            const unlinkedIncomes = incomes.filter(
                (i) =>
                    i.objectId === selectedObjectId &&
                    i.bookingId == null &&
                    dateInMonth(i.date) &&
                    matchRoom(i.roomId)
            );
            const unlinkedExpenses = expenses.filter(
                (e) =>
                    e.objectId === selectedObjectId &&
                    e.bookingId == null &&
                    dateInMonth(e.date) &&
                    matchRoom(e.roomId)
            );

            const commissionFromBookings = results.reduce((s, r) => s + r.commission, 0);
            const unlinkedExpensesAmount = unlinkedExpenses.reduce((s, e) => s + e.amount, 0);
            const incomeFromBookings = results.reduce((s, r) => s + r.income, 0);
            const expensesFromBookings = results.reduce((s, r) => s + r.totalExpenses, 0);

            const totalCommission = commissionFromBookings;
            const totalWithUnlinkedExpenses = totalCommission + unlinkedExpensesAmount;
            const totalIncome =
                incomeFromBookings + unlinkedIncomes.reduce((s, i) => s + i.amount, 0);
            const totalExpenses =
                expensesFromBookings + unlinkedExpensesAmount;

            setResult({
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
                                <MenuItem key={obj.id} value={String(obj.id)}>
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
                            value={
                                selectedRoomId === 'all'
                                    ? 'all'
                                    : String(selectedRoomId)
                            }
                            onChange={(e) => {
                                const v = e.target.value;
                                setSelectedRoomId(
                                    v === 'all' ? 'all' : Number(v)
                                );
                                setResult(null);
                            }}
                        >
                            <MenuItem value="all">{t('accountancy.all')}</MenuItem>
                            {roomsForObject.map((room) => (
                                <MenuItem key={room.id} value={String(room.id)}>
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

                    <FormControl sx={{ minWidth: 240 }} size="small">
                        <InputLabel>{t('accountancy.commission.scheme')}</InputLabel>
                        <Select
                            label={t('accountancy.commission.scheme')}
                            value={selectedSchemeId}
                            onChange={(e) => {
                                setSelectedSchemeId(Number(e.target.value) as CommissionSchemeId);
                                setResult(null);
                            }}
                        >
                            {SCHEMES.map((s) => (
                                <MenuItem key={s.id} value={s.id}>
                                    {t(s.labelKey)}
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
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        {t('accountancy.commission.result')}
                    </Typography>

                    <Stack spacing={2} sx={{ mb: 3 }}>
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={2}
                            flexWrap="wrap"
                            useFlexGap
                        >
                            <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 140 }}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('accountancy.commission.commissionForMonth')}
                                </Typography>
                                <Typography variant="h5" color="primary.main">
                                    {formatAmount(result.totalCommission)}
                                </Typography>
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 140 }}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('accountancy.commission.unlinkedExpenses')}
                                </Typography>
                                <Typography variant="subtitle1" color="error.main">
                                    {formatAmount(result.unlinkedExpensesAmount)}
                                </Typography>
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 140 }}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('accountancy.commission.totalWithUnlinkedExpenses')}
                                </Typography>
                                <Typography
                                    variant="h5"
                                    color={
                                        result.totalWithUnlinkedExpenses >= 0
                                            ? 'primary.main'
                                            : 'error.main'
                                    }
                                >
                                    {formatAmount(result.totalWithUnlinkedExpenses)}
                                </Typography>
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 140 }}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('accountancy.commission.totalIncome')}
                                </Typography>
                                <Typography variant="subtitle1" color="success.main">
                                    {formatAmount(result.totalIncome)}
                                </Typography>
                            </Paper>
                            <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 140 }}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('accountancy.commission.totalExpenses')}
                                </Typography>
                                <Typography variant="subtitle1" color="error.main">
                                    {formatAmount(result.totalExpenses)}
                                </Typography>
                            </Paper>
                        </Stack>
                    </Stack>

                    {result.bookings.length === 0 ? (
                        <Typography color="text.secondary">
                            {t('accountancy.commission.noBookings')}
                        </Typography>
                    ) : (
                        <>
                            <Table size="small" sx={{ mb: 2 }}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('bookings.title')}</TableCell>
                                        <TableCell align="right">
                                            {t('common.nights')}
                                        </TableCell>
                                        <TableCell align="right">
                                            {t('accountancy.commission.income')}
                                        </TableCell>
                                        <TableCell align="right">
                                            {t('accountancy.commission.expenses')}
                                        </TableCell>
                                        <TableCell align="right">
                                            {t('accountancy.commission.commissionAmount')}
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {result.bookings.map((r) => (
                                        <TableRow key={r.bookingId}>
                                            <TableCell>{r.bookingTitle}</TableCell>
                                            <TableCell align="right">
                                                {r.nights}
                                            </TableCell>
                                            <TableCell align="right">
                                                {formatAmount(r.income)}
                                            </TableCell>
                                            <TableCell align="right">
                                                {formatAmount(r.totalExpenses)}
                                            </TableCell>
                                            <TableCell align="right">
                                                {formatAmount(r.commission)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                {t('accountancy.commission.algorithmSteps')}
                            </Typography>
                            {result.bookings.map((r) => (
                                <Accordion key={r.bookingId} defaultExpanded={result.bookings.length <= 3}>
                                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                        <Typography>
                                            {r.bookingTitle} — {formatAmount(r.commission)}
                                        </Typography>
                                    </AccordionSummary>
                                    <AccordionDetails>
                                        <Stack spacing={1}>
                                            {r.steps.map((step, idx) => (
                                                <Box
                                                    key={idx}
                                                    sx={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        flexWrap: 'wrap',
                                                        gap: 1,
                                                    }}
                                                >
                                                    <Typography variant="body2">
                                                        {step.description}
                                                    </Typography>
                                                    {step.value !== undefined && (
                                                        <Typography
                                                            variant="body2"
                                                            fontWeight={500}
                                                        >
                                                            {typeof step.value === 'number'
                                                                ? formatAmount(step.value)
                                                                : step.value}
                                                        </Typography>
                                                    )}
                                                    {step.formula && (
                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                            sx={{ width: '100%' }}
                                                        >
                                                            {step.formula}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            ))}
                                        </Stack>
                                    </AccordionDetails>
                                </Accordion>
                            ))}
                        </>
                    )}
                </Paper>
            )}
        </Box>
    );
}

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
    isOtaCommission,
    isCoAgentCommission,
} from '@/lib/commissionCalculation';
import { Expense, Income, Booking, AccountancyCategory } from '@/lib/types';

const DEFAULT_SCHEME_ID: CommissionSchemeId = 2;

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
                roomFilter === 'all'
                    ? selectedObject?.name ?? ''
                    : `${selectedObject?.name ?? ''} — ${roomsForObject.find((r) => r.id === roomFilter)?.name ?? ''}`;

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
                                                        <Typography variant="body2">{step.description}</Typography>
                                                        {step.value !== undefined && (
                                                            <Typography variant="body2" fontWeight={500}>
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
                                ))
                            )}
                        </Paper>
                    </Box>
                </Paper>
            )}
        </Box>
    );
}

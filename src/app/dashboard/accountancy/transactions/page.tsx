'use client';

import {
    Box,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    IconButton,
    Stack,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Switch,
    Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEffect, useMemo, useState } from 'react';
import type { Booking, Expense, ExpenseStatus, Income, IncomeStatus, TransactionListRow } from '@/lib/types';
import { getTransactions } from '@/lib/transactions';
import { deleteExpense, updateExpense } from '@/lib/expenses';
import { deleteIncome, updateIncome } from '@/lib/incomes';
import { getBookingsByIds } from '@/lib/bookings';
import { getCounterparties } from '@/lib/counterparties';
import { getCashflows } from '@/lib/cashflows';
import { getUsersWithCashflow } from '@/lib/users';
import { formatSourceRecipientLabel } from '@/components/accountancy/SourceRecipientSelect';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';
import { getExpenseSum, getIncomeSum } from '@/lib/accountancyUtils';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useObjects } from '@/providers/ObjectsProvider';
import { useTranslation } from '@/i18n/useTranslation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'accountancy-transactions-filters';

type FilterRecordType = '' | 'expense' | 'income';

function loadTransactionFilters() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const k = parsed.filterRecordType;
        const filterRecordType: FilterRecordType =
            k === 'expense' || k === 'income' || k === '' ? k : '';
        return {
            filterRecordType,
            filterObjectId: String(parsed.filterObjectId ?? ''),
            filterCategory: String(parsed.filterCategory ?? ''),
            filterStatus: String(parsed.filterStatus ?? ''),
            filterRoomId: String(parsed.filterRoomId ?? ''),
            sortByAmountAsc:
                parsed.sortByAmountAsc === true || parsed.sortByAmountAsc === false
                    ? parsed.sortByAmountAsc
                    : null,
            sortByDateAsc:
                parsed.sortByDateAsc === true || parsed.sortByDateAsc === false
                    ? parsed.sortByDateAsc
                    : true,
            filtersExpanded: Boolean(parsed.filtersExpanded ?? true),
        };
    } catch {
        return null;
    }
}

function saveTransactionFilters(state: {
    filterRecordType: FilterRecordType;
    filterObjectId: string;
    filterCategory: string;
    filterStatus: string;
    filterRoomId: string;
    sortByAmountAsc: boolean | null;
    sortByDateAsc: boolean | null;
    filtersExpanded: boolean;
}) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // ignore
    }
}

function getRowStatus(row: TransactionListRow): ExpenseStatus | IncomeStatus {
    if (row.recordType === 'expense') {
        return row.status;
    }
    const s = (row as Income).status;
    return s === 'confirmed' || s === 'draft' ? s : 'draft';
}

function rowSum(row: TransactionListRow): number {
    return row.recordType === 'expense' ? getExpenseSum(row as Expense) : getIncomeSum(row as Income);
}

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();
    const [rows, setRows] = useState<TransactionListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const { setSnackbar } = useSnackbar();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [rowToDelete, setRowToDelete] = useState<TransactionListRow | null>(null);
    const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

    const hasAccess = isAdmin || isAccountant;

    const [categoriesExpense, setCategoriesExpense] = useState<Awaited<ReturnType<typeof getAccountancyCategories>>>(
        [],
    );
    const [categoriesIncome, setCategoriesIncome] = useState<Awaited<ReturnType<typeof getAccountancyCategories>>>(
        [],
    );
    const [filtersHydrated, setFiltersHydrated] = useState(false);
    const [filterRecordType, setFilterRecordType] = useState<FilterRecordType>('');
    const [filterObjectId, setFilterObjectId] = useState<string>('');
    const [filterCategory, setFilterCategory] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterRoomId, setFilterRoomId] = useState<string>('');
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [cashflows, setCashflows] = useState<{ _id: string; name: string }[]>([]);
    const [usersWithCashflow, setUsersWithCashflow] = useState<{ _id: string; name: string }[]>([]);

    const [sortByAmountAsc, setSortByAmountAsc] = useState<boolean | null>(null);
    const [sortByDateAsc, setSortByDateAsc] = useState<boolean | null>(true);

    const [filtersExpanded, setFiltersExpanded] = useState<boolean>(true);

    useEffect(() => {
        const s = loadTransactionFilters();
        if (s) {
            setFilterRecordType(s.filterRecordType);
            setFilterObjectId(s.filterObjectId);
            setFilterCategory(s.filterCategory);
            setFilterStatus(s.filterStatus);
            setFilterRoomId(s.filterRoomId);
            setSortByAmountAsc(s.sortByAmountAsc);
            setSortByDateAsc(s.sortByDateAsc);
            setFiltersExpanded(s.filtersExpanded);
        }
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const k = params.get('kind');
            if (k === 'expense' || k === 'income') {
                setFilterRecordType(k);
            }
        }
        setFiltersHydrated(true);
    }, []);

    useEffect(() => {
        if (!filtersHydrated) return;
        saveTransactionFilters({
            filterRecordType,
            filterObjectId,
            filterCategory,
            filterStatus,
            filterRoomId,
            sortByAmountAsc,
            sortByDateAsc,
            filtersExpanded,
        });
    }, [
        filtersHydrated,
        filterRecordType,
        filterObjectId,
        filterCategory,
        filterStatus,
        filterRoomId,
        sortByAmountAsc,
        sortByDateAsc,
        filtersExpanded,
    ]);

    useEffect(() => {
        Promise.all([
            getTransactions(),
            getAccountancyCategories('expense'),
            getAccountancyCategories('income'),
            getCounterparties(),
            getCashflows(),
            getUsersWithCashflow(),
        ])
            .then(async ([list, catsExp, catsInc, cps, cfs, usersCf]) => {
                setRows(list);
                setCategoriesExpense(catsExp);
                setCategoriesIncome(catsInc);
                setCounterparties(cps.map((c) => ({ _id: c._id!, name: c.name })));
                setCashflows(cfs.map((c) => ({ _id: c._id!, name: c.name })));
                setUsersWithCashflow(usersCf);
                const bookingIds = Array.from(
                    new Set(list.map((r) => r.bookingId).filter((id): id is number => typeof id === 'number')),
                );
                if (bookingIds.length) {
                    const bookingsList = await getBookingsByIds(bookingIds);
                    setBookings(bookingsList);
                } else {
                    setBookings([]);
                }
                setLoading(false);
            })
            .catch((error) => {
                console.error('Error loading transactions:', error);
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
                setLoading(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const uniqueValues = useMemo(() => {
        const categories = new Set<string>();
        const statuses = new Set<ExpenseStatus | IncomeStatus>();

        rows.forEach((row) => {
            if (row.category) categories.add(row.category);
            statuses.add(getRowStatus(row));
        });

        return {
            categories: Array.from(categories).sort(),
            statuses: statuses.size > 0 ? Array.from(statuses) : (['draft', 'confirmed'] as const),
        };
    }, [rows]);

    const roomsForSelectedObject = useMemo(
        () => (filterObjectId ? (objects.find((o) => o.id === Number(filterObjectId))?.roomTypes ?? []) : []),
        [filterObjectId, objects],
    );

    const formatDate = (date: Date | string | undefined): string => {
        if (!date) return '';
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const getObjectName = (row: TransactionListRow): string => {
        const object = objects.find((obj) => obj.id === row.objectId);
        if (!object) return t('accountancy.notSpecified');
        return object.name;
    };

    const getRoomName = (row: TransactionListRow): string => {
        const roomId =
            row.roomId ?? (row.bookingId ? bookings.find((b) => b.id === row.bookingId)?.unitId : undefined);
        if (roomId == null) return '-';
        const object = objects.find((obj) => obj.id === row.objectId);
        const room = object?.roomTypes?.find((r) => r.id === roomId);
        const name = room?.name?.trim();
        return name ? name : String(roomId);
    };

    const getStatusLabel = (status: ExpenseStatus | IncomeStatus) => {
        if (status === 'draft') return t('accountancy.statusDraft');
        if (status === 'confirmed') return t('accountancy.statusConfirmed');
        return status;
    };

    const formatAmount = (value: number | undefined): string => {
        if (value == null || Number.isNaN(Number(value))) return '';
        const fixed = Number(value).toFixed(2);
        const [intPart, decPart] = fixed.split('.');
        const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return `${withSpaces}.${decPart ?? '00'}`;
    };

    const filteredAndSortedRows = useMemo(() => {
        let filtered = [...rows];

        if (filterRecordType === 'expense') {
            filtered = filtered.filter((r) => r.recordType === 'expense');
        } else if (filterRecordType === 'income') {
            filtered = filtered.filter((r) => r.recordType === 'income');
        }

        if (filterObjectId) {
            const id = Number(filterObjectId);
            filtered = filtered.filter((e) => e.objectId === id);
        }

        if (filterCategory) {
            filtered = filtered.filter((e) => e.category === filterCategory);
        }

        if (filterStatus) {
            filtered = filtered.filter((e) => getRowStatus(e) === filterStatus);
        }

        if (filterRoomId) {
            const roomIdNum = Number(filterRoomId);
            filtered = filtered.filter((e) => {
                if (e.roomId === roomIdNum) return true;
                if (!e.bookingId) return false;
                const booking = bookings.find((b) => b.id === e.bookingId);
                return booking && (booking.unitId ?? null) === roomIdNum;
            });
        }

        filtered.sort((a, b) => {
            const dateA = a.date ? new Date(a.date as string | Date).getTime() : 0;
            const dateB = b.date ? new Date(b.date as string | Date).getTime() : 0;
            const sumA = rowSum(a);
            const sumB = rowSum(b);

            if (sortByDateAsc !== null) {
                if (dateA !== dateB) {
                    return sortByDateAsc ? dateA - dateB : dateB - dateA;
                }
            }

            if (sortByAmountAsc !== null) {
                if (sumA !== sumB) {
                    return sortByAmountAsc ? sumA - sumB : sumB - sumA;
                }
            }

            return 0;
        });

        return filtered;
    }, [
        rows,
        filterRecordType,
        filterObjectId,
        filterCategory,
        filterStatus,
        filterRoomId,
        bookings,
        sortByAmountAsc,
        sortByDateAsc,
    ]);

    const refreshRows = async () => {
        const list = await getTransactions();
        setRows(list);
        const bookingIds = Array.from(
            new Set(list.map((r) => r.bookingId).filter((id): id is number => typeof id === 'number')),
        );
        if (bookingIds.length) {
            const bookingsList = await getBookingsByIds(bookingIds);
            setBookings(bookingsList);
        } else {
            setBookings([]);
        }
    };

    const handleDeleteClick = (row: TransactionListRow) => {
        setRowToDelete(row);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!rowToDelete || !rowToDelete._id) return;

        try {
            const res =
                rowToDelete.recordType === 'expense'
                    ? await deleteExpense(rowToDelete._id)
                    : await deleteIncome(rowToDelete._id);
            setSnackbar({
                open: true,
                message:
                    res.message ||
                    (rowToDelete.recordType === 'expense'
                        ? t('accountancy.expenseDeleted')
                        : t('accountancy.incomeDeleted')),
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                await refreshRows();
            }
        } catch (error) {
            console.error('Error deleting transaction:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setDeleteDialogOpen(false);
            setRowToDelete(null);
        }
    };

    const handleDeleteCancel = () => {
        setDeleteDialogOpen(false);
        setRowToDelete(null);
    };

    const handleEditClick = (row: TransactionListRow) => {
        if (!row._id) return;
        if (row.recordType === 'expense') {
            router.push(`/dashboard/accountancy/expense/edit/${row._id}`);
        } else {
            router.push(`/dashboard/accountancy/income/edit/${row._id}`);
        }
    };

    const handleStatusToggle = async (row: TransactionListRow) => {
        if (!row._id) return;
        const current = getRowStatus(row);
        const newStatus: ExpenseStatus | IncomeStatus = current === 'confirmed' ? 'draft' : 'confirmed';
        setStatusUpdatingId(row._id);
        try {
            if (row.recordType === 'expense') {
                const { recordType, ...rest } = row as Expense & { recordType: 'expense' };
                void recordType;
                const payload: Expense = {
                    ...rest,
                    status: newStatus as ExpenseStatus,
                    date: rest.date
                        ? typeof rest.date === 'string'
                            ? new Date(rest.date)
                            : rest.date
                        : new Date(),
                };
                const res = await updateExpense(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setRows((prev) =>
                        prev.map((r) =>
                            r._id === row._id && r.recordType === 'expense'
                                ? { ...r, status: newStatus as ExpenseStatus }
                                : r,
                        ),
                    );
                }
            } else {
                const { recordType, ...rest } = row as Income & { recordType: 'income' };
                void recordType;
                const payload: Income = {
                    ...rest,
                    status: newStatus as IncomeStatus,
                    date: rest.date
                        ? typeof rest.date === 'string'
                            ? new Date(rest.date)
                            : rest.date
                        : new Date(),
                };
                const res = await updateIncome(payload);
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setRows((prev) =>
                        prev.map((r) =>
                            r._id === row._id && r.recordType === 'income'
                                ? { ...r, status: newStatus as IncomeStatus }
                                : r,
                        ),
                    );
                }
            }
        } catch (error) {
            console.error('Error updating transaction status:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setStatusUpdatingId(null);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.transactionsTitle')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2,
                    flexWrap: 'wrap',
                    gap: 1,
                }}
            >
                <Typography variant="h4">{t('accountancy.transactionsTitle')}</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Link href="/dashboard/accountancy/expense/add">
                        <Button variant="contained" startIcon={<AddIcon />}>
                            {t('accountancy.addExpense')}
                        </Button>
                    </Link>
                    <Link href="/dashboard/accountancy/income/add">
                        <Button variant="outlined" startIcon={<AddIcon />}>
                            {t('accountancy.addIncome')}
                        </Button>
                    </Link>
                    <Link href="/dashboard/accountancy/transactions/bulk-add">
                        <Button variant="outlined" startIcon={<AddIcon />}>
                            {t('accountancy.bulkAddTransactions')}
                        </Button>
                    </Link>
                </Stack>
            </Box>

            {!loading && rows.length > 0 && (
                <Accordion
                    expanded={filtersExpanded}
                    onChange={(_, expanded) => setFiltersExpanded(expanded)}
                    sx={{ mb: 2 }}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="filters-content" id="filters-header">
                        <Typography variant="h6">{t('accountancy.filters')}</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} flexWrap="wrap">
                            <FormControl sx={{ minWidth: 180 }}>
                                <InputLabel>{t('accountancy.transactionRecordType')}</InputLabel>
                                <Select
                                    value={filterRecordType}
                                    onChange={(e) => setFilterRecordType(e.target.value as FilterRecordType)}
                                    label={t('accountancy.transactionRecordType')}
                                >
                                    <MenuItem value="">{t('accountancy.filterRecordTypeAll')}</MenuItem>
                                    <MenuItem value="expense">{t('accountancy.expensesTitle')}</MenuItem>
                                    <MenuItem value="income">{t('accountancy.incomesTitle')}</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControl sx={{ minWidth: 180 }}>
                                <InputLabel>{t('accountancy.object')}</InputLabel>
                                <Select
                                    value={filterObjectId}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setFilterObjectId(v);
                                        if (!v) setFilterRoomId('');
                                    }}
                                    label={t('accountancy.object')}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {objects.map((obj) => (
                                        <MenuItem key={`${obj.propertyName || 'obj'}-${obj.id}`} value={String(obj.id)}>
                                            {obj.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl sx={{ minWidth: 180 }} disabled={!filterObjectId}>
                                <InputLabel>{t('common.room')}</InputLabel>
                                <Select
                                    value={filterRoomId}
                                    onChange={(e) => setFilterRoomId(e.target.value)}
                                    label={t('common.room')}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {filterObjectId &&
                                        roomsForSelectedObject.map((room) => (
                                            <MenuItem key={room.id} value={String(room.id)}>
                                                {room.name || `Room ${room.id}`}
                                            </MenuItem>
                                        ))}
                                </Select>
                            </FormControl>
                            <FormControl sx={{ minWidth: 220 }}>
                                <InputLabel>{t('accountancy.category')}</InputLabel>
                                <Select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    label={t('accountancy.category')}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {filterRecordType === '' &&
                                        uniqueValues.categories.map((name) => (
                                            <MenuItem key={name} value={name}>
                                                {name}
                                            </MenuItem>
                                        ))}
                                    {filterRecordType === 'expense' &&
                                        buildCategoriesForSelect(categoriesExpense, 'expense').map((item) => (
                                            <MenuItem key={item.id} value={item.name}>
                                                {item.depth > 0 ? '\u00A0'.repeat(item.depth * 2) + '↳ ' : ''}
                                                {item.name}
                                            </MenuItem>
                                        ))}
                                    {filterRecordType === 'income' &&
                                        buildCategoriesForSelect(categoriesIncome, 'income').map((item) => (
                                            <MenuItem key={item.id} value={item.name}>
                                                {item.depth > 0 ? '\u00A0'.repeat(item.depth * 2) + '↳ ' : ''}
                                                {item.name}
                                            </MenuItem>
                                        ))}
                                </Select>
                            </FormControl>
                            <FormControl sx={{ minWidth: 150 }}>
                                <InputLabel>{t('accountancy.status')}</InputLabel>
                                <Select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    label={t('accountancy.status')}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {uniqueValues.statuses.map((status) => (
                                        <MenuItem key={status} value={status}>
                                            {getStatusLabel(status)}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Button
                                    variant="outlined"
                                    onClick={() => {
                                        setFilterObjectId('');
                                        setFilterCategory('');
                                        setFilterStatus('');
                                        setFilterRoomId('');
                                        setFilterRecordType('');
                                    }}
                                >
                                    {t('accountancy.clearFilters')}
                                </Button>
                            </Box>
                        </Stack>
                    </AccordionDetails>
                </Accordion>
            )}

            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : rows.length === 0 ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                    {t('accountancy.noTransactions')}
                </Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.transactionTypeColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.dateColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.objectColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('common.room')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.bookingColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.categoryColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.source')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.recipient')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.cost')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.quantity')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {t('accountancy.amountColumn')}
                                        <IconButton
                                            size="small"
                                            onClick={() => setSortByAmountAsc((prev) => (prev === null ? true : !prev))}
                                            sx={{ padding: 0.5 }}
                                        >
                                            {sortByAmountAsc ? (
                                                <ArrowUpwardIcon fontSize="small" />
                                            ) : (
                                                <ArrowDownwardIcon fontSize="small" />
                                            )}
                                        </IconButton>
                                    </Box>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {t('accountancy.dateColumn')}
                                        <IconButton
                                            size="small"
                                            onClick={() => setSortByDateAsc((prev) => (prev === null ? true : !prev))}
                                            sx={{ padding: 0.5 }}
                                        >
                                            {sortByDateAsc ? (
                                                <ArrowUpwardIcon fontSize="small" />
                                            ) : (
                                                <ArrowDownwardIcon fontSize="small" />
                                            )}
                                        </IconButton>
                                    </Box>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.statusColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: '120px' }}>{t('accountancy.actions')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredAndSortedRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={14} align="center">
                                        <Typography sx={{ py: 2 }}>{t('accountancy.noFilteredTransactions')}</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredAndSortedRows.map((row) => (
                                    <TableRow
                                        key={`${row.recordType}-${row._id}`}
                                        sx={
                                            (row as TransactionListRow & { autoCreated?: { ruleId?: string } }).autoCreated
                                                ? {
                                                      bgcolor: (theme) =>
                                                          theme.palette.mode === 'light'
                                                              ? 'rgba(46, 125, 50, 0.06)'
                                                              : 'rgba(102, 187, 106, 0.1)',
                                                  }
                                                : undefined
                                        }
                                    >
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={
                                                    row.recordType === 'expense'
                                                        ? t('accountancy.expense')
                                                        : t('accountancy.income')
                                                }
                                                color={row.recordType === 'expense' ? 'error' : 'success'}
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell>{formatDate(row.date)}</TableCell>
                                        <TableCell>{getObjectName(row)}</TableCell>
                                        <TableCell>{getRoomName(row)}</TableCell>
                                        <TableCell>{row.bookingId ?? '-'}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                                                <span>{row.category}</span>
                                                {(row as { autoCreated?: { ruleId?: string } }).autoCreated && (
                                                    <Chip
                                                        size="small"
                                                        label={t('accountancy.autoAccounting.autoCreatedBadge')}
                                                        color="success"
                                                        variant="outlined"
                                                    />
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                            {formatSourceRecipientLabel(
                                                row.source,
                                                objects,
                                                counterparties,
                                                usersWithCashflow,
                                                cashflows,
                                            )}
                                        </TableCell>
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                            {formatSourceRecipientLabel(
                                                row.recipient,
                                                objects,
                                                counterparties,
                                                usersWithCashflow,
                                                cashflows,
                                            )}
                                        </TableCell>
                                        <TableCell>{formatAmount(row.amount)}</TableCell>
                                        <TableCell>{row.quantity ?? 1}</TableCell>
                                        <TableCell>
                                            {formatAmount(rowSum(row))} ({t('accountancy.amountColumn')})
                                        </TableCell>
                                        <TableCell>{formatDate(row.date)}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 70 }}>
                                                    {getRowStatus(row) === 'confirmed'
                                                        ? t('accountancy.statusConfirmed')
                                                        : t('accountancy.statusDraft')}
                                                </Typography>
                                                <Switch
                                                    checked={getRowStatus(row) === 'confirmed'}
                                                    onChange={() => handleStatusToggle(row)}
                                                    disabled={statusUpdatingId === row._id}
                                                    size="small"
                                                    color="primary"
                                                />
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleEditClick(row)}
                                                    color="primary"
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleDeleteClick(row)}
                                                    color="error"
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
                <DialogTitle>
                    {rowToDelete?.recordType === 'expense'
                        ? t('accountancy.deleteExpenseTitle')
                        : t('accountancy.deleteIncomeTitle')}
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {rowToDelete?.recordType === 'expense'
                            ? t('accountancy.deleteExpenseMessage')
                            : t('accountancy.deleteIncomeMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleDeleteCancel}>{t('common.cancel')}</Button>
                    <Button onClick={handleDeleteConfirm} color="error" variant="contained">
                        {t('common.delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

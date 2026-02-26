'use client'

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
} from "@mui/material"
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEffect, useMemo, useState } from "react";
import { Expense, ExpenseStatus, Booking } from "@/lib/types";
import { getExpenses, deleteExpense, updateExpense } from "@/lib/expenses";
import { getBookingsByIds } from "@/lib/bookings";
import { getAccountancyCategories } from "@/lib/accountancyCategories";
import { buildCategoriesForSelect } from "@/lib/accountancyCategoryUtils";
import { getExpenseSum } from "@/lib/accountancyUtils";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useObjects } from "@/providers/ObjectsProvider";
import { useTranslation } from "@/i18n/useTranslation";
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'accountancy-expense-filters';

function loadExpenseFilters() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            filterObjectId: String(parsed.filterObjectId ?? ''),
            filterCategory: String(parsed.filterCategory ?? ''),
            filterStatus: String(parsed.filterStatus ?? ''),
            filterRoomId: String(parsed.filterRoomId ?? ''),
            sortByAmountAsc: parsed.sortByAmountAsc === true || parsed.sortByAmountAsc === false ? parsed.sortByAmountAsc : null,
            sortByDateAsc: parsed.sortByDateAsc === true || parsed.sortByDateAsc === false ? parsed.sortByDateAsc : true,
            filtersExpanded: Boolean(parsed.filtersExpanded ?? true),
        };
    } catch {
        return null;
    }
}

function saveExpenseFilters(state: {
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

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const { setSnackbar } = useSnackbar();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
    const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

    const hasAccess = isAdmin || isAccountant;

    const [categories, setCategories] = useState<Awaited<ReturnType<typeof getAccountancyCategories>>>([]);
    const [filterObjectId, setFilterObjectId] = useState<string>(() => loadExpenseFilters()?.filterObjectId ?? '');
    const [filterCategory, setFilterCategory] = useState<string>(() => loadExpenseFilters()?.filterCategory ?? '');
    const [filterStatus, setFilterStatus] = useState<string>(() => loadExpenseFilters()?.filterStatus ?? '');
    const [filterRoomId, setFilterRoomId] = useState<string>(() => loadExpenseFilters()?.filterRoomId ?? '');
    const [bookings, setBookings] = useState<Booking[]>([]);

    const [sortByAmountAsc, setSortByAmountAsc] = useState<boolean | null>(() => loadExpenseFilters()?.sortByAmountAsc ?? null);
    const [sortByDateAsc, setSortByDateAsc] = useState<boolean | null>(() => loadExpenseFilters()?.sortByDateAsc ?? true);

    const [filtersExpanded, setFiltersExpanded] = useState<boolean>(() => loadExpenseFilters()?.filtersExpanded ?? true);

    useEffect(() => {
        saveExpenseFilters({
            filterObjectId,
            filterCategory,
            filterStatus,
            filterRoomId,
            sortByAmountAsc,
            sortByDateAsc,
            filtersExpanded,
        });
    }, [filterObjectId, filterCategory, filterStatus, filterRoomId, sortByAmountAsc, sortByDateAsc, filtersExpanded]);

    useEffect(() => {
        Promise.all([
            getExpenses(),
            getAccountancyCategories('expense'),
        ])
            .then(async ([list, cats]) => {
                setExpenses(list);
                setCategories(cats);
                const bookingIds = Array.from(
                    new Set(list.map((e) => e.bookingId).filter((id): id is number => typeof id === 'number')),
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
                console.error('Error loading expenses:', error);
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
        const statuses = new Set<ExpenseStatus>();

        expenses.forEach((expense) => {
            if (expense.category) categories.add(expense.category);
            if (expense.status) statuses.add(expense.status);
        });

        return {
            categories: Array.from(categories).sort(),
            statuses: Array.from(statuses),
        };
    }, [expenses]);

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

    const getObjectName = (expense: Expense): string => {
        const object = objects.find((obj) => obj.id === expense.objectId);
        if (!object) return t('accountancy.notSpecified');
        return object.name;
    };

    const getRoomName = (expense: Expense): string => {
        const roomId = expense.roomId ?? (expense.bookingId ? bookings.find((b) => b.id === expense.bookingId)?.unitId : undefined);
        if (roomId == null) return '-';
        const object = objects.find((obj) => obj.id === expense.objectId);
        const room = object?.roomTypes?.find((r) => r.id === roomId);
        const name = room?.name?.trim();
        return name ? name : String(roomId);
    };

    const getStatusLabel = (status: ExpenseStatus) => {
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

    const filteredAndSortedExpenses = useMemo(() => {
        let filtered = [...expenses];

        if (filterObjectId) {
            const id = Number(filterObjectId);
            filtered = filtered.filter((e) => e.objectId === id);
        }

        if (filterCategory) {
            filtered = filtered.filter((e) => e.category === filterCategory);
        }

        if (filterStatus) {
            filtered = filtered.filter((e) => e.status === filterStatus);
        }

        if (filterRoomId) {
            const roomIdNum = Number(filterRoomId);
            filtered = filtered.filter((e) => {
                // Прямая привязка к комнате
                if (e.roomId === roomIdNum) return true;
                // Привязка через бронирование
                if (!e.bookingId) return false;
                const booking = bookings.find((b) => b.id === e.bookingId);
                return booking && (booking.unitId ?? null) === roomIdNum;
            });
        }

        filtered.sort((a, b) => {
            const dateA = a.date ? new Date(a.date as any).getTime() : 0;
            const dateB = b.date ? new Date(b.date as any).getTime() : 0;
            const sumA = getExpenseSum(a);
            const sumB = getExpenseSum(b);

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
    }, [expenses, filterObjectId, filterCategory, filterStatus, filterRoomId, bookings, sortByAmountAsc, sortByDateAsc]);

    const handleDeleteClick = (expense: Expense) => {
        setExpenseToDelete(expense);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!expenseToDelete || !expenseToDelete._id) return;

        try {
            const res = await deleteExpense(expenseToDelete._id);
            setSnackbar({
                open: true,
                message: res.message || t('accountancy.expenseDeleted'),
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                const updatedExpenses = await getExpenses();
                setExpenses(updatedExpenses);
            }
        } catch (error) {
            console.error('Error deleting expense:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setDeleteDialogOpen(false);
            setExpenseToDelete(null);
        }
    };

    const handleDeleteCancel = () => {
        setDeleteDialogOpen(false);
        setExpenseToDelete(null);
    };

    const handleEditClick = (expense: Expense) => {
        if (expense._id) {
            router.push(`/dashboard/accountancy/expense/edit/${expense._id}`);
        }
    };

    const handleStatusToggle = async (expense: Expense) => {
        if (!expense._id) return;
        const newStatus: ExpenseStatus = expense.status === 'confirmed' ? 'draft' : 'confirmed';
        setStatusUpdatingId(expense._id);
        try {
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
                    prev.map((e) => (e._id === expense._id ? { ...e, status: newStatus } : e)),
                );
            }
        } catch (error) {
            console.error('Error updating expense status:', error);
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
                <Typography variant="h4">{t('accountancy.expensesTitle')}</Typography>
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h4">{t('accountancy.expensesTitle')}</Typography>
                <Link href="/dashboard/accountancy/expense/add">
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                    >
                        {t('accountancy.addExpense')}
                    </Button>
                </Link>
            </Box>

            {!loading && expenses.length > 0 && (
                <Accordion
                    expanded={filtersExpanded}
                    onChange={(_, expanded) => setFiltersExpanded(expanded)}
                    sx={{ mb: 2 }}
                >
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        aria-controls="filters-content"
                        id="filters-header"
                    >
                        <Typography variant="h6">{t('accountancy.filters')}</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} flexWrap="wrap">
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
                                        <MenuItem key={obj.id} value={String(obj.id)}>
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
                                    {filterObjectId && roomsForSelectedObject.map((room) => (
                                        <MenuItem key={room.id} value={String(room.id)}>
                                            {room.name || `Room ${room.id}`}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl sx={{ minWidth: 150 }}>
                                <InputLabel>{t('accountancy.category')}</InputLabel>
                                <Select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    label={t('accountancy.category')}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {buildCategoriesForSelect(categories, 'expense').map((item) => (
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
            ) : expenses.length === 0 ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                    {t('accountancy.noExpenses')}
                </Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.dateColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.objectColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('common.room')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.bookingColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.categoryColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.cost')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.quantity')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {t('accountancy.amountColumn')}
                                        <IconButton
                                            size="small"
                                            onClick={() =>
                                                setSortByAmountAsc((prev) =>
                                                    prev === null ? true : !prev,
                                                )
                                            }
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
                                            onClick={() =>
                                                setSortByDateAsc((prev) =>
                                                    prev === null ? true : !prev,
                                                )
                                            }
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
                                <TableCell sx={{ fontWeight: 'bold', width: '120px' }}>
                                    {t('accountancy.actions')}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredAndSortedExpenses.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={11} align="center">
                                        <Typography sx={{ py: 2 }}>
                                            {t('accountancy.noFilteredExpenses')}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredAndSortedExpenses.map((expense) => (
                                    <TableRow
                                        key={expense._id}
                                        sx={
                                            (expense as Expense & { autoCreated?: { ruleId?: string } }).autoCreated
                                                ? { bgcolor: (theme) => (theme.palette.mode === 'light' ? 'rgba(46, 125, 50, 0.06)' : 'rgba(102, 187, 106, 0.1)') }
                                                : undefined
                                        }
                                    >
                                        <TableCell>{formatDate(expense.date)}</TableCell>
                                        <TableCell>{getObjectName(expense)}</TableCell>
                                        <TableCell>{getRoomName(expense)}</TableCell>
                                        <TableCell>{expense.bookingId ?? '-'}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                                                <span>{expense.category}</span>
                                                {(expense as Expense & { autoCreated?: { ruleId?: string } }).autoCreated && (
                                                    <Chip size="small" label={t('accountancy.autoAccounting.autoCreatedBadge')} color="success" variant="outlined" />
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell>{formatAmount(expense.amount)}</TableCell>
                                        <TableCell>{expense.quantity ?? 1}</TableCell>
                                        <TableCell>{formatAmount(getExpenseSum(expense))} ({t('accountancy.amountColumn')})</TableCell>
                                        <TableCell>{formatDate(expense.date)}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 70 }}>
                                                    {expense.status === 'confirmed'
                                                        ? t('accountancy.statusConfirmed')
                                                        : t('accountancy.statusDraft')}
                                                </Typography>
                                                <Switch
                                                    checked={expense.status === 'confirmed'}
                                                    onChange={() => handleStatusToggle(expense)}
                                                    disabled={statusUpdatingId === expense._id}
                                                    size="small"
                                                    color="primary"
                                                />
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleEditClick(expense)}
                                                    color="primary"
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleDeleteClick(expense)}
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

            <Dialog
                open={deleteDialogOpen}
                onClose={handleDeleteCancel}
            >
                <DialogTitle>{t('accountancy.deleteExpenseTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('accountancy.deleteExpenseMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleDeleteCancel}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleDeleteConfirm} color="error" variant="contained">
                        {t('common.delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}


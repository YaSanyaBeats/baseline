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
} from "@mui/material"
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEffect, useMemo, useState } from "react";
import { Income, IncomeStatus, Booking } from "@/lib/types";
import { getIncomes, deleteIncome, updateIncome } from "@/lib/incomes";
import { getBookingsByIds } from "@/lib/bookings";
import { getAccountancyCategories } from "@/lib/accountancyCategories";
import { buildCategoriesForSelect } from "@/lib/accountancyCategoryUtils";
import { getIncomeSum } from "@/lib/accountancyUtils";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useObjects } from "@/providers/ObjectsProvider";
import { useTranslation } from "@/i18n/useTranslation";
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'accountancy-income-filters';

function loadIncomeFilters() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            filterObjectId: String(parsed.filterObjectId ?? ''),
            filterCategory: String(parsed.filterCategory ?? ''),
            filterRoomId: String(parsed.filterRoomId ?? ''),
            filterStatus: String(parsed.filterStatus ?? ''),
            sortByAmountAsc: parsed.sortByAmountAsc === true || parsed.sortByAmountAsc === false ? parsed.sortByAmountAsc : null,
            sortByDateAsc: parsed.sortByDateAsc === true || parsed.sortByDateAsc === false ? parsed.sortByDateAsc : true,
            filtersExpanded: Boolean(parsed.filtersExpanded ?? true),
        };
    } catch {
        return null;
    }
}

function saveIncomeFilters(state: {
    filterObjectId: string;
    filterCategory: string;
    filterRoomId: string;
    filterStatus: string;
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
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [loading, setLoading] = useState(true);
    const { setSnackbar } = useSnackbar();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [incomeToDelete, setIncomeToDelete] = useState<Income | null>(null);
    const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

    const hasAccess = isAdmin || isAccountant;

    const [categories, setCategories] = useState<Awaited<ReturnType<typeof getAccountancyCategories>>>([]);
    const [filterObjectId, setFilterObjectId] = useState<string>(() => loadIncomeFilters()?.filterObjectId ?? '');
    const [filterCategory, setFilterCategory] = useState<string>(() => loadIncomeFilters()?.filterCategory ?? '');
    const [filterRoomId, setFilterRoomId] = useState<string>(() => loadIncomeFilters()?.filterRoomId ?? '');
    const [filterStatus, setFilterStatus] = useState<string>(() => loadIncomeFilters()?.filterStatus ?? '');
    const [bookings, setBookings] = useState<Booking[]>([]);

    const [sortByAmountAsc, setSortByAmountAsc] = useState<boolean | null>(() => loadIncomeFilters()?.sortByAmountAsc ?? null);
    const [sortByDateAsc, setSortByDateAsc] = useState<boolean | null>(() => loadIncomeFilters()?.sortByDateAsc ?? true);

    const [filtersExpanded, setFiltersExpanded] = useState<boolean>(() => loadIncomeFilters()?.filtersExpanded ?? true);

    useEffect(() => {
        saveIncomeFilters({
            filterObjectId,
            filterCategory,
            filterRoomId,
            filterStatus,
            sortByAmountAsc,
            sortByDateAsc,
            filtersExpanded,
        });
    }, [filterObjectId, filterCategory, filterRoomId, filterStatus, sortByAmountAsc, sortByDateAsc, filtersExpanded]);

    useEffect(() => {
        Promise.all([
            getIncomes(),
            getAccountancyCategories('income'),
        ])
            .then(async ([list, cats]) => {
                setIncomes(list);
                setCategories(cats);
                const bookingIds = Array.from(
                    new Set(list.map((i) => i.bookingId).filter((id): id is number => typeof id === 'number')),
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
                console.error('Error loading incomes:', error);
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
        const statuses = new Set<IncomeStatus>();

        incomes.forEach((income) => {
            if (income.category) categories.add(income.category);
            const s = (income as any).status;
            if (s === 'draft' || s === 'confirmed') statuses.add(s);
        });

        return {
            categories: Array.from(categories).sort(),
            statuses: statuses.size > 0 ? Array.from(statuses) : (['draft', 'confirmed'] as IncomeStatus[]),
        };
    }, [incomes]);

    const getStatusLabel = (status: IncomeStatus) => {
        if (status === 'draft') return t('accountancy.statusDraft');
        if (status === 'confirmed') return t('accountancy.statusConfirmed');
        return status;
    };

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

    const getObjectName = (income: Income): string => {
        const object = objects.find((obj) => obj.id === income.objectId);
        if (!object) return t('accountancy.notSpecified');
        return object.name;
    };

    const getRoomName = (income: Income): string => {
        const roomId = income.roomId ?? (income.bookingId ? bookings.find((b) => b.id === income.bookingId)?.unitId : undefined);
        if (roomId == null) return '-';
        const object = objects.find((obj) => obj.id === income.objectId);
        const room = object?.roomTypes?.find((r) => r.id === roomId);
        const name = room?.name?.trim();
        return name ? name : String(roomId);
    };

    const formatAmount = (value: number | undefined): string => {
        if (value == null || Number.isNaN(Number(value))) return '';
        const fixed = Number(value).toFixed(2);
        const [intPart, decPart] = fixed.split('.');
        const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return `${withSpaces}.${decPart ?? '00'}`;
    };

    const filteredAndSortedIncomes = useMemo(() => {
        let filtered = [...incomes];

        if (filterObjectId) {
            const id = Number(filterObjectId);
            filtered = filtered.filter((e) => e.objectId === id);
        }

        if (filterCategory) {
            filtered = filtered.filter((e) => e.category === filterCategory);
        }

        if (filterStatus) {
            filtered = filtered.filter((e) => ((e as any).status ?? 'draft') === filterStatus);
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
            const sumA = getIncomeSum(a);
            const sumB = getIncomeSum(b);

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
    }, [incomes, filterObjectId, filterCategory, filterStatus, filterRoomId, bookings, sortByAmountAsc, sortByDateAsc]);

    const handleDeleteClick = (income: Income) => {
        setIncomeToDelete(income);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!incomeToDelete || !incomeToDelete._id) return;

        try {
            const res = await deleteIncome(incomeToDelete._id);
            setSnackbar({
                open: true,
                message: res.message || t('accountancy.incomeDeleted'),
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                const updatedIncomes = await getIncomes();
                setIncomes(updatedIncomes);
            }
        } catch (error) {
            console.error('Error deleting income:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setDeleteDialogOpen(false);
            setIncomeToDelete(null);
        }
    };

    const handleDeleteCancel = () => {
        setDeleteDialogOpen(false);
        setIncomeToDelete(null);
    };

    const handleEditClick = (income: Income) => {
        if (income._id) {
            router.push(`/dashboard/accountancy/income/edit/${income._id}`);
        }
    };

    const handleStatusToggle = async (income: Income) => {
        if (!income._id) return;
        const currentStatus = (income as any).status ?? 'draft';
        const newStatus: IncomeStatus = currentStatus === 'confirmed' ? 'draft' : 'confirmed';
        setStatusUpdatingId(income._id);
        try {
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
                    prev.map((i) => (i._id === income._id ? { ...i, status: newStatus } : i)),
                );
            }
        } catch (error) {
            console.error('Error updating income status:', error);
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
                <Typography variant="h4">{t('accountancy.incomesTitle')}</Typography>
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
                <Typography variant="h4">{t('accountancy.incomesTitle')}</Typography>
                <Link href="/dashboard/accountancy/income/add">
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                    >
                        {t('accountancy.addIncome')}
                    </Button>
                </Link>
            </Box>

            {!loading && incomes.length > 0 && (
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
                                    {buildCategoriesForSelect(categories, 'income').map((item) => (
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
            ) : incomes.length === 0 ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                    {t('accountancy.noIncomes')}
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
                            {filteredAndSortedIncomes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={11} align="center">
                                        <Typography sx={{ py: 2 }}>
                                            {t('accountancy.noFilteredIncomes')}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredAndSortedIncomes.map((income) => (
                                    <TableRow key={income._id}>
                                        <TableCell>{formatDate(income.date)}</TableCell>
                                        <TableCell>{getObjectName(income)}</TableCell>
                                        <TableCell>{getRoomName(income)}</TableCell>
                                        <TableCell>{income.bookingId ?? '-'}</TableCell>
                                        <TableCell>{income.category}</TableCell>
                                        <TableCell>{formatAmount(income.amount)}</TableCell>
                                        <TableCell>{income.quantity ?? 1}</TableCell>
                                        <TableCell>{formatAmount(getIncomeSum(income))} ({t('accountancy.amountColumn')})</TableCell>
                                        <TableCell>{formatDate(income.date)}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 70 }}>
                                                    {((income as any).status ?? 'draft') === 'confirmed'
                                                        ? t('accountancy.statusConfirmed')
                                                        : t('accountancy.statusDraft')}
                                                </Typography>
                                                <Switch
                                                    checked={((income as any).status ?? 'draft') === 'confirmed'}
                                                    onChange={() => handleStatusToggle(income)}
                                                    disabled={statusUpdatingId === income._id}
                                                    size="small"
                                                    color="primary"
                                                />
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleEditClick(income)}
                                                    color="primary"
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleDeleteClick(income)}
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
                <DialogTitle>{t('accountancy.deleteIncomeTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('accountancy.deleteIncomeMessage')}
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


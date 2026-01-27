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
} from "@mui/material"
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEffect, useMemo, useState } from "react";
import { Income } from "@/lib/types";
import { getIncomes, deleteIncome } from "@/lib/incomes";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useObjects } from "@/providers/ObjectsProvider";
import { useTranslation } from "@/i18n/useTranslation";
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

    const hasAccess = isAdmin || isAccountant;

    const [filterObjectId, setFilterObjectId] = useState<string>('');
    const [filterCategory, setFilterCategory] = useState<string>('');

    const [sortByAmountAsc, setSortByAmountAsc] = useState<boolean | null>(null);
    const [sortByDateAsc, setSortByDateAsc] = useState<boolean | null>(true);

    const [filtersExpanded, setFiltersExpanded] = useState<boolean>(false);

    useEffect(() => {
        getIncomes()
            .then((list) => {
                setIncomes(list);
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

        incomes.forEach((income) => {
            if (income.category) categories.add(income.category);
        });

        return {
            categories: Array.from(categories).sort(),
        };
    }, [incomes]);

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

    const filteredAndSortedIncomes = useMemo(() => {
        let filtered = [...incomes];

        if (filterObjectId) {
            const id = Number(filterObjectId);
            filtered = filtered.filter((e) => e.objectId === id);
        }

        if (filterCategory) {
            filtered = filtered.filter((e) => e.category === filterCategory);
        }

        filtered.sort((a, b) => {
            const dateA = a.date ? new Date(a.date as any).getTime() : 0;
            const dateB = b.date ? new Date(b.date as any).getTime() : 0;
            const amountA = a.amount ?? 0;
            const amountB = b.amount ?? 0;

            if (sortByDateAsc !== null) {
                if (dateA !== dateB) {
                    return sortByDateAsc ? dateA - dateB : dateB - dateA;
                }
            }

            if (sortByAmountAsc !== null) {
                if (amountA !== amountB) {
                    return sortByAmountAsc ? amountA - amountB : amountB - amountA;
                }
            }

            return 0;
        });

        return filtered;
    }, [incomes, filterObjectId, filterCategory, sortByAmountAsc, sortByDateAsc]);

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
                                    onChange={(e) => setFilterObjectId(e.target.value)}
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
                            <FormControl sx={{ minWidth: 150 }}>
                                <InputLabel>{t('accountancy.category')}</InputLabel>
                                <Select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    label={t('accountancy.category')}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {uniqueValues.categories.map((category) => (
                                        <MenuItem key={category} value={category}>
                                            {category}
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
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.bookingColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.categoryColumn')}</TableCell>
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
                                <TableCell sx={{ fontWeight: 'bold', width: '120px' }}>
                                    {t('accountancy.actions')}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredAndSortedIncomes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
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
                                        <TableCell>{income.bookingId ?? '-'}</TableCell>
                                        <TableCell>{income.category}</TableCell>
                                        <TableCell>{income.amount}</TableCell>
                                        <TableCell>{formatDate(income.date)}</TableCell>
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


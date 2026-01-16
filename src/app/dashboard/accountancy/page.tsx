'use client'

import { Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Alert, Link as MuiLink, FormControl, InputLabel, Select, MenuItem, IconButton, Stack, Accordion, AccordionSummary, AccordionDetails, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from "@mui/material"
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEffect, useState, useMemo } from "react";
import { Report } from "@/lib/types";
import { getReports, deleteReport } from "@/lib/reports";
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
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const { setSnackbar } = useSnackbar();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [reportToDelete, setReportToDelete] = useState<Report | null>(null);

    // Фильтры
    const [filterMonth, setFilterMonth] = useState<string>('');
    const [filterYear, setFilterYear] = useState<string>('');
    const [filterOwner, setFilterOwner] = useState<string>('');
    const [filterAccountant, setFilterAccountant] = useState<string>('');
    
    // Сортировка (true = по возрастанию, false = по убыванию)
    const [sortAscending, setSortAscending] = useState<boolean>(false);
    
    // Состояние аккордеона фильтров
    const [filtersExpanded, setFiltersExpanded] = useState<boolean>(false);

    // Проверка доступа
    const hasAccess = isAdmin || isAccountant;

    // Загрузка списка отчётов
    useEffect(() => {
        getReports().then((reportsList) => {
            setReports(reportsList);
            setLoading(false);
        }).catch((error) => {
            console.error('Error loading reports:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
            setLoading(false);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Загружаем только при монтировании компонента

    // Получаем уникальные значения для фильтров
    const uniqueValues = useMemo(() => {
        const owners = new Set<string>();
        const accountants = new Set<string>();
        const years = new Set<number>();

        reports.forEach(report => {
            if (report.ownerName) owners.add(report.ownerName);
            if (report.accountantName) accountants.add(report.accountantName);
            if (report.reportYear) years.add(report.reportYear);
        });

        return {
            owners: Array.from(owners).sort(),
            accountants: Array.from(accountants).sort(),
            years: Array.from(years).sort((a, b) => b - a) // От новых к старым
        };
    }, [reports]);

    // Фильтрация и сортировка отчётов
    const filteredAndSortedReports = useMemo(() => {
        let filtered = [...reports];

        // Фильтр по месяцу
        if (filterMonth !== '') {
            filtered = filtered.filter(r => r.reportMonth === Number(filterMonth));
        }

        // Фильтр по году
        if (filterYear !== '') {
            filtered = filtered.filter(r => r.reportYear === Number(filterYear));
        }

        // Фильтр по владельцу
        if (filterOwner) {
            filtered = filtered.filter(r => r.ownerName === filterOwner);
        }

        // Фильтр по бухгалтеру
        if (filterAccountant) {
            filtered = filtered.filter(r => r.accountantName === filterAccountant);
        }

        // Сортировка по дате создания
        filtered.sort((a, b) => {
            const dateA = a.createdAt ? (typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt) : new Date(0);
            const dateB = b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt) : new Date(0);
            
            if (sortAscending) {
                return dateA.getTime() - dateB.getTime();
            } else {
                return dateB.getTime() - dateA.getTime();
            }
        });

        return filtered;
    }, [reports, filterMonth, filterYear, filterOwner, filterAccountant, sortAscending]);

    const formatDate = (date: Date | string | undefined): string => {
        if (!date) return '';
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    const getMonthName = (month: number): string => {
        return t(`accountancy.months.${month}`);
    }

    const getObjectName = (objectId: number | undefined): string => {
        if (!objectId) return t('accountancy.notSpecified');
        const object = objects.find(obj => obj.id === objectId);
        return object?.name || t('accountancy.notSpecified');
    }

    const handleDeleteClick = (report: Report) => {
        setReportToDelete(report);
        setDeleteDialogOpen(true);
    }

    const handleDeleteConfirm = async () => {
        if (!reportToDelete || !reportToDelete._id) return;

        try {
            const res = await deleteReport(reportToDelete._id);
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                // Обновляем список отчётов
                const updatedReports = await getReports();
                setReports(updatedReports);
            }
        } catch (error) {
            console.error('Error deleting report:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setDeleteDialogOpen(false);
            setReportToDelete(null);
        }
    }

    const handleDeleteCancel = () => {
        setDeleteDialogOpen(false);
        setReportToDelete(null);
    }

    const handleEditClick = (report: Report) => {
        if (report._id) {
            router.push(`/dashboard/accountancy/edit/${report._id}`);
        }
    }

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
        <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h4">{t('accountancy.title')}</Typography>
                <Link href="/dashboard/accountancy/add">
                    <Button 
                        variant="contained" 
                        startIcon={<AddIcon />}
                    >
                        {t('accountancy.addReport')}
                    </Button>
                </Link>
            </Box>

            {/* Фильтры */}
            {!loading && reports.length > 0 && (
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
                            <FormControl sx={{ minWidth: 150 }}>
                                <InputLabel>{t('accountancy.reportMonth')}</InputLabel>
                                <Select
                                    value={filterMonth}
                                    onChange={(e) => setFilterMonth(e.target.value)}
                                    label={t('accountancy.reportMonth')}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => (
                                        <MenuItem key={month} value={String(month)}>
                                            {t(`accountancy.months.${month}`)}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl sx={{ minWidth: 120 }}>
                                <InputLabel>{t('accountancy.reportYear')}</InputLabel>
                                <Select
                                    value={filterYear}
                                    onChange={(e) => setFilterYear(e.target.value)}
                                    label={t('accountancy.reportYear')}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {uniqueValues.years.map((year) => (
                                        <MenuItem key={year} value={String(year)}>
                                            {year}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl sx={{ minWidth: 200 }}>
                                <InputLabel>{t('accountancy.ownerColumn')}</InputLabel>
                                <Select
                                    value={filterOwner}
                                    onChange={(e) => setFilterOwner(e.target.value)}
                                    label={t('accountancy.ownerColumn')}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {uniqueValues.owners.map((owner) => (
                                        <MenuItem key={owner} value={owner}>
                                            {owner}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl sx={{ minWidth: 200 }}>
                                <InputLabel>{t('accountancy.accountantColumn')}</InputLabel>
                                <Select
                                    value={filterAccountant}
                                    onChange={(e) => setFilterAccountant(e.target.value)}
                                    label={t('accountancy.accountantColumn')}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {uniqueValues.accountants.map((accountant) => (
                                        <MenuItem key={accountant} value={accountant}>
                                            {accountant}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Button
                                    variant="outlined"
                                    onClick={() => {
                                        setFilterMonth('');
                                        setFilterYear('');
                                        setFilterOwner('');
                                        setFilterAccountant('');
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
            ) : reports.length === 0 ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                    {t('accountancy.noReports')}
                </Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.reportLinkColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.periodColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.objectColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.ownerColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{t('accountancy.accountantColumn')}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {t('accountancy.createdAtColumn')}
                                        <IconButton
                                            size="small"
                                            onClick={() => setSortAscending(!sortAscending)}
                                            sx={{ padding: 0.5 }}
                                        >
                                            {sortAscending ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                                        </IconButton>
                                    </Box>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: '120px' }}>{t('accountancy.actions')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredAndSortedReports.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        <Typography sx={{ py: 2 }}>{t('accountancy.noFilteredReports')}</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredAndSortedReports.map((report) => (
                                    <TableRow key={report._id}>
                                        <TableCell>
                                            <MuiLink 
                                                href={report.reportLink} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                sx={{ textDecoration: 'none' }}
                                            >
                                                {report.reportLink}
                                            </MuiLink>
                                        </TableCell>
                                        <TableCell>
                                            {getMonthName(report.reportMonth)} {report.reportYear}
                                        </TableCell>
                                        <TableCell>
                                            {getObjectName(report.objectId)}
                                        </TableCell>
                                        <TableCell>
                                            {report.ownerName || t('accountancy.notSpecified')}
                                        </TableCell>
                                        <TableCell>
                                            {report.accountantName || t('accountancy.notSpecified')}
                                        </TableCell>
                                        <TableCell>
                                            {formatDate(report.createdAt)}
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleEditClick(report)}
                                                    color="primary"
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleDeleteClick(report)}
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

            {/* Диалог подтверждения удаления */}
            <Dialog
                open={deleteDialogOpen}
                onClose={handleDeleteCancel}
            >
                <DialogTitle>{t('accountancy.deleteReportTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('accountancy.deleteReportMessage')}
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
    )
}

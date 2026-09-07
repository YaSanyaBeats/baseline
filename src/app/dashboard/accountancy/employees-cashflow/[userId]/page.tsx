'use client';

import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
    Link as MuiLink,
    Stack,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Expense, ExpenseStatus, Income, IncomeStatus } from '@/lib/types';
import { getExpenses, updateExpense } from '@/lib/expenses';
import { getIncomes, updateIncome } from '@/lib/incomes';
import { getCashflows } from '@/lib/cashflows';
import {
    getExpenseSum,
    getIncomeSum,
    getEffectiveReportAmount,
    parseSignedLocalizedAmount,
} from '@/lib/accountancyUtils';
import { accountancyBalanceMuiColor, roundAccountancyAmount } from '@/lib/accountancyOverviewSyntheticFill';
import { resolveDistrictForObjectId } from '@/lib/sourceRecipientDistrictFunds';
import { getCounterparties } from '@/lib/counterparties';
import { getUsersWithCashflow } from '@/lib/users';
import { formatSourceRecipientLabel } from '@/components/accountancy/SourceRecipientSelect';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';
import {
    ReportAmountDeltaBodyCells,
    ReportAmountDeltaHeaderCells,
} from '@/components/accountancy/ReportAmountDeltaCells';
import { createCashflowExport, getCashflowExports, type CashflowExportFile } from '@/lib/cashflowExports';

type RecordRow = {
    _id: string;
    type: 'expense' | 'income';
    date: Date | string;
    category: string;
    amount: number;
    comment: string;
    source?: string;
    recipient?: string;
    recipientLabel: string;
    objectId: number;
    roomName?: string | null;
    district: string;
    status: ExpenseStatus | IncomeStatus;
    reportAmount?: number | null;
    monthKey: string;
    monthLabel: string;
};

type MonthGroup = {
    monthKey: string;
    monthLabel: string;
    rows: RecordRow[];
    openingBalance: number;
    expenses: number;
    incomes: number;
    closingBalance: number;
};

const NO_DISTRICT_FILTER = '__none__';

function monthStatsFromRows(monthRows: RecordRow[]): { expenses: number; incomes: number } {
    let expenses = 0;
    let incomes = 0;
    for (const row of monthRows) {
        if (row.type === 'expense') expenses += Math.abs(row.amount);
        else incomes += Math.abs(row.amount);
    }
    return {
        expenses: roundAccountancyAmount(expenses),
        incomes: roundAccountancyAmount(incomes),
    };
}

function buildMonthGroups(sourceRows: RecordRow[], noMonthLabel: string): MonthGroup[] {
    const byMonth = new Map<string, RecordRow[]>();
    const monthLabels = new Map<string, string>();

    for (const row of sourceRows) {
        monthLabels.set(row.monthKey, row.monthLabel);
        const list = byMonth.get(row.monthKey) ?? [];
        list.push(row);
        byMonth.set(row.monthKey, list);
    }

    const datedKeys = Array.from(byMonth.keys())
        .filter((key) => key.length > 0)
        .sort((a, b) => a.localeCompare(b));

    const datedGroups: MonthGroup[] = [];
    let running = 0;
    for (const monthKey of datedKeys) {
        const monthRows = byMonth.get(monthKey) ?? [];
        const { expenses, incomes } = monthStatsFromRows(monthRows);
        const openingBalance = roundAccountancyAmount(running);
        const closingBalance = roundAccountancyAmount(openingBalance - expenses + incomes);
        running = closingBalance;
        datedGroups.push({
            monthKey,
            monthLabel: monthLabels.get(monthKey) ?? formatMonthLabel(monthKey, noMonthLabel),
            rows: monthRows,
            openingBalance,
            expenses,
            incomes,
            closingBalance,
        });
    }

    datedGroups.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    const undatedRows = byMonth.get('') ?? [];
    if (undatedRows.length === 0) return datedGroups;

    const { expenses, incomes } = monthStatsFromRows(undatedRows);
    return [
        ...datedGroups,
        {
            monthKey: '',
            monthLabel: monthLabels.get('') ?? noMonthLabel,
            rows: undatedRows,
            openingBalance: 0,
            expenses,
            incomes,
            closingBalance: roundAccountancyAmount(incomes - expenses),
        },
    ];
}

function monthKeyFromRecord(date: Date | string, reportMonth?: string | null): string {
    const rm = (reportMonth ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(rm)) return rm;
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string, fallback: string): string {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return fallback;
    const [y, m] = monthKey.split('-');
    return `${Number(m)}.${y}`;
}

function currentMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Page() {
    const params = useParams();
    const userId = typeof params.userId === 'string' ? params.userId : '';
    const { t, language } = useTranslation();
    const { objects } = useObjects();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();

    const [userName, setUserName] = useState('');
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [usersWithCashflow, setUsersWithCashflow] = useState<{ _id: string; name: string }[]>([]);
    const [allCashflows, setAllCashflows] = useState<{ _id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [noCashflow, setNoCashflow] = useState(false);
    const [reportAmountEditingId, setReportAmountEditingId] = useState<string | null>(null);
    const [reportAmountDraft, setReportAmountDraft] = useState('');
    const [reportAmountUpdatingId, setReportAmountUpdatingId] = useState<string | null>(null);
    const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
    const [filterDistricts, setFilterDistricts] = useState<string[]>([]);
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo, setExportTo] = useState('');
    const [exportRangeTouched, setExportRangeTouched] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportFiles, setExportFiles] = useState<CashflowExportFile[]>([]);
    const reportAmountEditEscapeRef = useRef(false);

    const hasAccess = isAdmin || isAccountant;
    const canEditReportAmount = isAdmin || isAccountant;
    const canEditStatus = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess || !userId) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const [cfList, cpList, usersCf, exportList] = await Promise.all([
                    getCashflows(),
                    getCounterparties(),
                    getUsersWithCashflow(),
                    getCashflowExports(userId),
                ]);
                if (cancelled) return;

                setAllCashflows(cfList.map((c) => ({ _id: c._id!, name: c.name })));
                setCounterparties(cpList.map((c) => ({ _id: c._id!, name: c.name })));
                setUsersWithCashflow(usersCf);
                setExportFiles(exportList);

                const selectedUser = usersCf.find((u) => u._id === userId);
                setUserName(selectedUser?.name ?? userId);

                const userCf = cfList.find((cf) => cf.userId === userId);
                if (!userCf?._id) {
                    setNoCashflow(true);
                    setExpenses([]);
                    setIncomes([]);
                    return;
                }

                setNoCashflow(false);

                const [expList, incList] = await Promise.all([
                    getExpenses({ cashflowId: userCf._id }),
                    getIncomes({ cashflowId: userCf._id }),
                ]);
                if (cancelled) return;

                setExpenses(expList);
                setIncomes(incList);
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setSnackbar({
                        open: true,
                        message: t('common.serverError'),
                        severity: 'error',
                    });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAccess, userId]);

    const roomFromBookingLabel = t('accountancy.sourceRecipientRoomFromBooking');

    const labelSource = (value: string | undefined) =>
        formatSourceRecipientLabel(
            value,
            objects,
            counterparties,
            usersWithCashflow,
            allCashflows,
            roomFromBookingLabel,
            undefined,
            undefined,
            undefined,
            undefined,
            language,
        );

    const noMonthLabel = t('accountancy.employeesCashflow.noMonth');

    const rows: RecordRow[] = useMemo(() => {
        const mapped: RecordRow[] = [
            ...expenses.map((e) => {
                const recipient = (e.recipient ?? '').trim();
                const monthKey = monthKeyFromRecord(e.date, e.reportMonth);
                return {
                    _id: e._id!,
                    type: 'expense' as const,
                    date: e.date,
                    category: e.category,
                    amount: -getExpenseSum(e),
                    comment: (e.comment ?? '').trim(),
                    source: e.source,
                    recipient: e.recipient,
                    recipientLabel: recipient ? labelSource(e.recipient) : '—',
                    objectId: e.objectId,
                    roomName: e.roomName,
                    district: resolveDistrictForObjectId(objects, e.objectId) ?? '',
                    status: e.status,
                    reportAmount: e.reportAmount ?? null,
                    monthKey,
                    monthLabel: formatMonthLabel(monthKey, noMonthLabel),
                };
            }),
            ...incomes.map((i) => {
                const recipient = (i.recipient ?? '').trim();
                const monthKey = monthKeyFromRecord(i.date, i.reportMonth);
                return {
                    _id: i._id!,
                    type: 'income' as const,
                    date: i.date,
                    category: i.category,
                    amount: getIncomeSum(i),
                    comment: (i.comment ?? '').trim(),
                    source: i.source,
                    recipient: i.recipient,
                    recipientLabel: recipient ? labelSource(i.recipient) : '—',
                    objectId: i.objectId,
                    roomName: i.roomName,
                    district: resolveDistrictForObjectId(objects, i.objectId) ?? '',
                    status: i.status,
                    reportAmount: i.reportAmount ?? null,
                    monthKey,
                    monthLabel: formatMonthLabel(monthKey, noMonthLabel),
                };
            }),
        ];
        return mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expenses, incomes, objects, counterparties, usersWithCashflow, allCashflows, language, t, noMonthLabel]);

    const districtFilterOptions = useMemo(() => {
        const names = new Set<string>();
        let hasEmpty = false;
        for (const row of rows) {
            if (row.district) names.add(row.district);
            else hasEmpty = true;
        }
        const options = Array.from(names).sort((a, b) => a.localeCompare(b, language === 'en' ? 'en' : 'ru'));
        if (hasEmpty) options.push(NO_DISTRICT_FILTER);
        return options;
    }, [rows, language]);

    const filteredRows = useMemo(() => {
        if (filterDistricts.length === 0) return rows;
        const selected = new Set(filterDistricts);
        return rows.filter((row) => {
            const key = row.district || NO_DISTRICT_FILTER;
            return selected.has(key);
        });
    }, [rows, filterDistricts]);

    const groupedByMonth: MonthGroup[] = useMemo(
        () => buildMonthGroups(filteredRows, noMonthLabel),
        [filteredRows, noMonthLabel],
    );

    const balance = roundAccountancyAmount(filteredRows.reduce((s, r) => s + r.amount, 0));

    useEffect(() => {
        if (exportRangeTouched) return;
        const keys = rows
            .map((r) => r.monthKey)
            .filter((k) => /^\d{4}-\d{2}$/.test(k))
            .sort();
        if (keys.length > 0) {
            setExportFrom(keys[0]);
            setExportTo(keys[keys.length - 1]);
            return;
        }
        if (!loading && !noCashflow) {
            const now = currentMonthKey();
            setExportFrom(now);
            setExportTo(now);
        }
    }, [rows, loading, noCashflow, exportRangeTouched]);

    const formatDate = (date: Date | string): string => {
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const formatRoomLabel = (objectId: number, roomName?: string | null): string => {
        const obj = objects.find((o) => o.id === objectId || o.propertyId === objectId);
        const objectLabel = (obj?.name ?? '').trim();
        const roomLabel = (roomName ?? '').trim();
        const parts = [objectLabel, roomLabel].filter((p) => p.length > 0);
        return parts.length > 0 ? parts.join(' — ') : '—';
    };

    const noDistrictLabel = t('accountancy.employeesCashflow.noDistrict');
    const districtOptionLabel = (value: string) =>
        value === NO_DISTRICT_FILTER ? noDistrictLabel : value;

    const formatAmount = (value: number): string => {
        const fixed = Number(value).toFixed(2);
        const [intPart, decPart] = fixed.split('.');
        const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return `${value >= 0 ? '+' : ''}${withSpaces}.${decPart ?? '00'}`;
    };

    const formatReportAmountDraft = (value: number): string =>
        value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rowKey = (row: RecordRow) => `${row.type}-${row._id}`;

    const handleReportAmountCommit = async (row: RecordRow, draft: string) => {
        if (reportAmountEditEscapeRef.current) {
            reportAmountEditEscapeRef.current = false;
            return;
        }
        const parsed = parseSignedLocalizedAmount(draft);
        if (parsed === null) {
            setSnackbar({
                open: true,
                message: t('accountancy.invalidReportAmount'),
                severity: 'error',
            });
            return;
        }
        const current = getEffectiveReportAmount(row.amount, row.reportAmount);
        if (Math.abs(parsed - current) < 1e-6) {
            setReportAmountEditingId(null);
            setReportAmountDraft('');
            return;
        }

        setReportAmountUpdatingId(rowKey(row));
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row._id);
                if (!expense) return;
                const res = await updateExpense({
                    ...expense,
                    date: expense.date
                        ? typeof expense.date === 'string'
                            ? new Date(expense.date)
                            : expense.date
                        : new Date(),
                    reportAmount: parsed,
                });
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) => (e._id === row._id ? { ...e, reportAmount: parsed } : e)),
                    );
                }
            } else {
                const income = incomes.find((i) => i._id === row._id);
                if (!income) return;
                const res = await updateIncome({
                    ...income,
                    date: income.date
                        ? typeof income.date === 'string'
                            ? new Date(income.date)
                            : income.date
                        : new Date(),
                    reportAmount: parsed,
                });
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) => (i._id === row._id ? { ...i, reportAmount: parsed } : i)),
                    );
                }
            }
        } catch (err) {
            console.error(err);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setReportAmountUpdatingId(null);
            setReportAmountEditingId(null);
            setReportAmountDraft('');
        }
    };

    const handleStatusToggle = async (row: RecordRow) => {
        if (!canEditStatus) return;
        const newStatus: ExpenseStatus | IncomeStatus = row.status === 'confirmed' ? 'draft' : 'confirmed';
        setStatusUpdatingId(rowKey(row));
        try {
            if (row.type === 'expense') {
                const expense = expenses.find((e) => e._id === row._id);
                if (!expense) return;
                const res = await updateExpense({
                    ...expense,
                    status: newStatus,
                    date: expense.date
                        ? typeof expense.date === 'string'
                            ? new Date(expense.date)
                            : expense.date
                        : new Date(),
                });
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.expenseUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setExpenses((prev) =>
                        prev.map((e) => (e._id === row._id ? { ...e, status: newStatus } : e)),
                    );
                }
            } else {
                const income = incomes.find((i) => i._id === row._id);
                if (!income) return;
                const res = await updateIncome({
                    ...income,
                    status: newStatus,
                    date: income.date
                        ? typeof income.date === 'string'
                            ? new Date(income.date)
                            : income.date
                        : new Date(),
                });
                setSnackbar({
                    open: true,
                    message: res.message || t('accountancy.incomeUpdated'),
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setIncomes((prev) =>
                        prev.map((i) => (i._id === row._id ? { ...i, status: newStatus } : i)),
                    );
                }
            }
        } catch (err) {
            console.error(err);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setStatusUpdatingId(null);
        }
    };

    const handleExport = async () => {
        if (!userId || !/^\d{4}-\d{2}$/.test(exportFrom) || !/^\d{4}-\d{2}$/.test(exportTo)) {
            setSnackbar({
                open: true,
                message: t('accountancy.employeesCashflow.exportInvalidRange'),
                severity: 'error',
            });
            return;
        }
        if (exportFrom > exportTo) {
            setSnackbar({
                open: true,
                message: t('accountancy.employeesCashflow.exportInvalidRange'),
                severity: 'error',
            });
            return;
        }
        setExporting(true);
        try {
            const res = await createCashflowExport({
                userId,
                fromMonth: exportFrom,
                toMonth: exportTo,
            });
            setSnackbar({
                open: true,
                message: res.message || (res.success
                    ? t('accountancy.employeesCashflow.exportDone')
                    : t('common.serverError')),
                severity: res.success ? 'success' : 'error',
            });
            if (res.success && res.export) {
                setExportFiles((prev) => [res.export!, ...prev]);
                const link = document.createElement('a');
                link.href = res.export.url;
                link.download = res.export.fileName;
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
        } catch (err) {
            console.error(err);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setExporting(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.employeesCashflow.detailsTitle')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                <Link href="/dashboard/accountancy/employees-cashflow">
                    <Button startIcon={<ArrowBackIcon />} size="small">
                        {t('common.back')}
                    </Button>
                </Link>
                <Typography variant="h4">
                    {t('accountancy.employeesCashflow.detailsTitle')}: {userName}
                </Typography>
            </Box>

            {!loading && !noCashflow && (
                <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Typography
                        variant="h3"
                        sx={{ fontWeight: 700 }}
                        color={accountancyBalanceMuiColor(balance)}
                    >
                        {formatAmount(balance)}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        {t('accountancy.myCashflowBalance')}
                    </Typography>
                    {rows.length > 0 && (
                        <Autocomplete
                            multiple
                            size="small"
                            options={districtFilterOptions}
                            value={filterDistricts}
                            onChange={(_, value) => setFilterDistricts(value)}
                            getOptionLabel={districtOptionLabel}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('accountancy.districtColumn')}
                                    placeholder={t('accountancy.all')}
                                />
                            )}
                            sx={{ minWidth: 260, maxWidth: 480, ml: { sm: 'auto' } }}
                        />
                    )}
                </Box>
            )}

            {!loading && !noCashflow && (
                <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                    <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
                        {t('accountancy.employeesCashflow.exportTitle')}
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
                        <TextField
                            type="month"
                            size="small"
                            label={t('accountancy.employeesCashflow.exportFrom')}
                            value={exportFrom}
                            onChange={(e) => {
                                setExportRangeTouched(true);
                                setExportFrom(e.target.value);
                            }}
                            slotProps={{ inputLabel: { shrink: true } }}
                            sx={{ minWidth: 180 }}
                        />
                        <TextField
                            type="month"
                            size="small"
                            label={t('accountancy.employeesCashflow.exportTo')}
                            value={exportTo}
                            onChange={(e) => {
                                setExportRangeTouched(true);
                                setExportTo(e.target.value);
                            }}
                            slotProps={{ inputLabel: { shrink: true } }}
                            sx={{ minWidth: 180 }}
                        />
                        <Button
                            variant="contained"
                            startIcon={<FileDownloadIcon />}
                            onClick={() => void handleExport()}
                            disabled={exporting || !exportFrom || !exportTo}
                        >
                            {exporting
                                ? t('accountancy.employeesCashflow.exporting')
                                : t('accountancy.employeesCashflow.exportButton')}
                        </Button>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {t('accountancy.employeesCashflow.exportFiles')}
                    </Typography>
                    {exportFiles.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            {t('accountancy.employeesCashflow.exportNoFiles')}
                        </Typography>
                    ) : (
                        <Box component="ul" sx={{ m: 0, pl: 2 }}>
                            {exportFiles.map((file) => (
                                <Box component="li" key={file._id} sx={{ mb: 0.5 }}>
                                    <MuiLink href={file.url} download={file.fileName} underline="hover">
                                        {file.fileName}
                                    </MuiLink>
                                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                                        {formatMonthLabel(file.fromMonth, file.fromMonth)}
                                        {' — '}
                                        {formatMonthLabel(file.toMonth, file.toMonth)}
                                        {file.createdAt
                                            ? ` · ${new Date(file.createdAt).toLocaleString('ru-RU')}`
                                            : ''}
                                        {` · ${file.rowCount} ${t('accountancy.employeesCashflow.exportRows')}`}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Paper>
            )}

            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : noCashflow ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">
                        {t('accountancy.employeesCashflow.noCashflowLinked')}
                    </Typography>
                </Paper>
            ) : rows.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">{t('accountancy.myCashflowNoRecords')}</Typography>
                </Paper>
            ) : filteredRows.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">
                        {t('accountancy.employeesCashflow.noFilteredRecords')}
                    </Typography>
                </Paper>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {groupedByMonth.map((monthGroup) => (
                        <Accordion key={monthGroup.monthKey || 'none'} defaultExpanded disableGutters>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 2,
                                        width: '100%',
                                        pr: 1,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        {monthGroup.monthLabel}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        fontWeight={600}
                                        color={accountancyBalanceMuiColor(monthGroup.closingBalance)}
                                    >
                                        {formatAmount(monthGroup.closingBalance)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        ({monthGroup.rows.length})
                                    </Typography>
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{ pt: 0, px: 0 }}>
                                <Box sx={{ px: 2, pb: 1.5 }}>
                                    <Table
                                        size="small"
                                        sx={{
                                            width: 'auto',
                                            minWidth: 520,
                                            '& .MuiTableCell-root': { py: 0.5, px: 1, fontSize: '0.8125rem' },
                                        }}
                                    >
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>{t('accountancy.openingBalanceColumn')}</TableCell>
                                                <TableCell>{t('accountancy.expensesTitle')}</TableCell>
                                                <TableCell>{t('accountancy.incomesTitle')}</TableCell>
                                                <TableCell>{t('accountancy.closingBalanceColumn')}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            <TableRow>
                                                <TableCell
                                                    sx={{
                                                        color: accountancyBalanceMuiColor(monthGroup.openingBalance),
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {formatAmount(monthGroup.openingBalance)}
                                                </TableCell>
                                                <TableCell sx={{ color: 'error.main' }}>
                                                    {formatAmount(-monthGroup.expenses)}
                                                </TableCell>
                                                <TableCell sx={{ color: 'success.main' }}>
                                                    {formatAmount(monthGroup.incomes)}
                                                </TableCell>
                                                <TableCell
                                                    sx={{
                                                        color: accountancyBalanceMuiColor(monthGroup.closingBalance),
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {formatAmount(monthGroup.closingBalance)}
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </Box>
                                <TableContainer
                                    component={Paper}
                                    variant="outlined"
                                    sx={{ maxHeight: '70vh' }}
                                >
                                    <Table
                                        size="small"
                                        stickyHeader
                                        sx={{
                                            '& .MuiTableCell-head': {
                                                backgroundColor: 'background.paper',
                                            },
                                        }}
                                    >
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                                <TableCell>{t('common.room')}</TableCell>
                                                <TableCell>{t('accountancy.districtColumn')}</TableCell>
                                                <TableCell>{t('accountancy.categoryColumn')}</TableCell>
                                                <TableCell>{t('accountancy.source')}</TableCell>
                                                <TableCell>{t('accountancy.recipient')}</TableCell>
                                                <TableCell sx={{ minWidth: 180 }}>
                                                    {t('accountancy.comment')}
                                                </TableCell>
                                                <TableCell align="right" sx={{ whiteSpace: 'nowrap', minWidth: 112 }}>
                                                    {t('accountancy.amountColumn')}
                                                </TableCell>
                                                <ReportAmountDeltaHeaderCells t={t} />
                                                <TableCell align="center">{t('accountancy.statusColumn')}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {monthGroup.rows.map((row) => (
                                                <TableRow key={`${row.type}-${row._id}`}>
                                                    <TableCell>{formatDate(row.date)}</TableCell>
                                                    <TableCell
                                                        sx={{
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                            maxWidth: 240,
                                                        }}
                                                    >
                                                        {formatRoomLabel(row.objectId, row.roomName)}
                                                    </TableCell>
                                                    <TableCell>{row.district || noDistrictLabel}</TableCell>
                                                    <TableCell>{row.category}</TableCell>
                                                    <TableCell
                                                        sx={{
                                                            maxWidth: 200,
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                        }}
                                                    >
                                                        {labelSource(row.source)}
                                                    </TableCell>
                                                    <TableCell
                                                        sx={{
                                                            maxWidth: 200,
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                        }}
                                                    >
                                                        {row.recipientLabel}
                                                    </TableCell>
                                                    <TableCell
                                                        sx={{
                                                            maxWidth: 280,
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                        }}
                                                    >
                                                        {row.comment || '—'}
                                                    </TableCell>
                                                    <TableCell
                                                        align="right"
                                                        sx={{
                                                            color:
                                                                row.amount >= 0
                                                                    ? 'success.main'
                                                                    : 'error.main',
                                                            fontWeight: 500,
                                                            whiteSpace: 'nowrap',
                                                            minWidth: 112,
                                                        }}
                                                    >
                                                        {formatAmount(row.amount)}
                                                    </TableCell>
                                                    <ReportAmountDeltaBodyCells
                                                        signedAmount={row.amount}
                                                        reportAmount={row.reportAmount}
                                                        formatAmount={formatAmount}
                                                        t={t}
                                                        editable={canEditReportAmount}
                                                        editing={reportAmountEditingId === rowKey(row)}
                                                        draft={reportAmountDraft}
                                                        updating={reportAmountUpdatingId === rowKey(row)}
                                                        onStartEdit={() => {
                                                            setReportAmountEditingId(rowKey(row));
                                                            setReportAmountDraft(
                                                                formatReportAmountDraft(
                                                                    getEffectiveReportAmount(
                                                                        row.amount,
                                                                        row.reportAmount,
                                                                    ),
                                                                ),
                                                            );
                                                        }}
                                                        onDraftChange={setReportAmountDraft}
                                                        onCommit={(raw) => void handleReportAmountCommit(row, raw)}
                                                        onEscape={() => {
                                                            reportAmountEditEscapeRef.current = true;
                                                            setReportAmountEditingId(null);
                                                            setReportAmountDraft('');
                                                        }}
                                                    />
                                                    <TableCell align="center" sx={{ py: 0 }}>
                                                        <Tooltip
                                                            title={
                                                                row.status === 'confirmed'
                                                                    ? t('accountancy.statusVerified')
                                                                    : t('accountancy.statusDraft')
                                                            }
                                                        >
                                                            <span>
                                                                <Checkbox
                                                                    checked={row.status === 'confirmed'}
                                                                    size="small"
                                                                    disabled={
                                                                        !canEditStatus ||
                                                                        statusUpdatingId === rowKey(row)
                                                                    }
                                                                    onChange={() => void handleStatusToggle(row)}
                                                                    inputProps={{
                                                                        'aria-label':
                                                                            row.status === 'confirmed'
                                                                                ? t('accountancy.statusVerified')
                                                                                : t('accountancy.statusDraft'),
                                                                    }}
                                                                />
                                                            </span>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Box>
            )}
        </Box>
    );
}

'use client';

import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Autocomplete,
    Box,
    Button,
    IconButton,
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
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Expense, ExpenseStatus, Income, IncomeStatus } from '@/lib/types';
import { deleteExpense, getExpenses, updateExpense } from '@/lib/expenses';
import { deleteIncome, getIncomes, updateIncome } from '@/lib/incomes';
import { getCashflows } from '@/lib/cashflows';
import {
    getExpenseSum,
    getIncomeSum,
    getEffectiveReportAmount,
    getParentTransactionPointer,
    parseSignedLocalizedAmount,
} from '@/lib/accountancyUtils';
import { withReturnTo } from '@/lib/accountancyReturnTo';
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
import QuickSubtransactionDialog, {
    type QuickSubtransactionParent,
} from '@/components/accountancy/QuickSubtransactionDialog';

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
    transactionNumber?: number;
    /** Автор записи — для права «только свои черновики» */
    accountantId?: string;
    reportAmount?: number | null;
    monthKey: string;
    monthLabel: string;
    isSubtransaction: boolean;
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

export type CashflowLedgerVariant = 'self' | 'employee';

export default function CashflowLedgerView({
    userId,
    variant,
}: {
    userId: string;
    /** self — свой кешфлоу (/dashboard/cashflow); employee — карточка сотрудника */
    variant: CashflowLedgerVariant;
}) {
    const router = useRouter();
    const { t, language } = useTranslation();
    const { objects } = useObjects();
    const { user, isAdmin, isAccountant } = useUser();
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
    const [filterDistricts, setFilterDistricts] = useState<string[]>([]);
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo, setExportTo] = useState('');
    const [exportRangeTouched, setExportRangeTouched] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportFiles, setExportFiles] = useState<CashflowExportFile[]>([]);
    const [subtransactionParent, setSubtransactionParent] = useState<QuickSubtransactionParent | null>(null);
    const reportAmountEditEscapeRef = useRef(false);

    const isStaff = isAdmin || isAccountant;
    const currentUserId = user?._id?.toString?.() ?? '';
    const hasAccess = variant === 'employee' ? isStaff : isStaff || Boolean(user?.hasCashflow);
    const canEditReportAmount = isStaff;
    const canExport = isStaff;
    const returnTo = variant === 'self' ? '/dashboard/cashflow' : `/dashboard/accountancy/employees-cashflow/${userId}`;

    const canMutateRow = (row: { status: ExpenseStatus | IncomeStatus; accountantId?: string }) => {
        if (isStaff) return true;
        return (
            variant === 'self' &&
            Boolean(user?.hasCashflow) &&
            row.status === 'draft' &&
            row.accountantId === currentUserId
        );
    };

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
                    canExport ? getCashflowExports(userId) : Promise.resolve([]),
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
    }, [hasAccess, userId, canExport]);

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
                    transactionNumber: e.transactionNumber,
                    accountantId: e.accountantId?.toString?.() ?? (e.accountantId ? String(e.accountantId) : undefined),
                    reportAmount: e.reportAmount ?? null,
                    monthKey,
                    monthLabel: formatMonthLabel(monthKey, noMonthLabel),
                    isSubtransaction: Boolean(getParentTransactionPointer(e)),
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
                    transactionNumber: i.transactionNumber,
                    accountantId: i.accountantId?.toString?.() ?? (i.accountantId ? String(i.accountantId) : undefined),
                    reportAmount: i.reportAmount ?? null,
                    monthKey,
                    monthLabel: formatMonthLabel(monthKey, noMonthLabel),
                    isSubtransaction: Boolean(getParentTransactionPointer(i)),
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

    const transactionHref = (row: RecordRow) => {
        const base =
            row.type === 'expense' && variant === 'self' && !isStaff
                ? `/dashboard/cashflow/expense/edit/${row._id}`
                : row.type === 'expense'
                  ? `/dashboard/accountancy/expense/edit/${row._id}`
                  : `/dashboard/accountancy/income/edit/${row._id}`;
        return withReturnTo(base, returnTo);
    };

    const openTransaction = (row: RecordRow) => {
        router.push(transactionHref(row));
    };

    const openSubtransactionDialog = (row: RecordRow) => {
        if (row.isSubtransaction) return;
        if (row.type === 'expense') {
            const expense = expenses.find((e) => e._id === row._id);
            if (!expense) return;
            setSubtransactionParent({ type: 'expense', record: expense });
            return;
        }
        const income = incomes.find((i) => i._id === row._id);
        if (!income) return;
        setSubtransactionParent({ type: 'income', record: income });
    };

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

    const handleDelete = (row: RecordRow) => {
        if (!canMutateRow(row)) return;
        const message = row.type === 'expense' ? t('accountancy.deleteExpenseMessage') : t('accountancy.deleteIncomeMessage');
        if (!window.confirm(message)) return;
        const request = row.type === 'expense' ? deleteExpense(row._id) : deleteIncome(row._id);
        request
            .then((res) => {
                setSnackbar({
                    open: true,
                    message:
                        res.message ||
                        (row.type === 'expense' ? t('accountancy.expenseDeleted') : t('accountancy.incomeDeleted')),
                    severity: res.success ? 'success' : 'error',
                });
                if (!res.success) return;
                if (row.type === 'expense') {
                    setExpenses((prev) => prev.filter((e) => e._id !== row._id));
                } else {
                    setIncomes((prev) => prev.filter((i) => i._id !== row._id));
                }
            })
            .catch(() => {
                setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
            });
    };

    const pageTitle =
        variant === 'self'
            ? t('accountancy.myCashflowTitle')
            : `${t('accountancy.employeesCashflow.detailsTitle')}${userName ? `: ${userName}` : ''}`;

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{pageTitle}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                {variant === 'employee' && (
                    <Link href="/dashboard/accountancy/employees-cashflow">
                        <Button startIcon={<ArrowBackIcon />} size="small">
                            {t('common.back')}
                        </Button>
                    </Link>
                )}
                <Typography variant="h4">{pageTitle}</Typography>
            </Box>

            {variant === 'self' && !loading && !noCashflow && (
                <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                    <Link href={withReturnTo('/dashboard/accountancy/cashflow/expense/add', returnTo)}>
                        <Button variant="contained" startIcon={<AddIcon />}>
                            {t('accountancy.addExpense')}
                        </Button>
                    </Link>
                    <Link href={withReturnTo('/dashboard/accountancy/cashflow/income/add', returnTo)}>
                        <Button variant="contained" startIcon={<AddIcon />}>
                            {t('accountancy.addIncome')}
                        </Button>
                    </Link>
                </Box>
            )}

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
                </Box>
            )}

            {canExport && !loading && !noCashflow && (
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

            {!loading && !noCashflow && rows.length > 0 && (
                <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-start' }}>
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
                        sx={{ minWidth: 260, maxWidth: 480 }}
                    />
                </Box>
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
                                                <TableCell sx={{ width: 72, whiteSpace: 'nowrap' }}>
                                                    {t('accountancy.transactionIdColumn')}
                                                </TableCell>
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
                                                <TableCell align="right" sx={{ width: 120, px: 0.5 }}>
                                                    {t('accountancy.actions')}
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {monthGroup.rows.map((row) => {
                                                const mutable = canMutateRow(row);
                                                return (
                                                <TableRow
                                                    key={`${row.type}-${row._id}`}
                                                    hover
                                                    tabIndex={mutable ? 0 : undefined}
                                                    aria-label={mutable ? t('common.edit') : undefined}
                                                    onClick={mutable ? () => openTransaction(row) : undefined}
                                                    onKeyDown={
                                                        mutable
                                                            ? (e) => {
                                                                  if (e.key === 'Enter' || e.key === ' ') {
                                                                      e.preventDefault();
                                                                      openTransaction(row);
                                                                  }
                                                              }
                                                            : undefined
                                                    }
                                                    sx={{ cursor: mutable ? 'pointer' : 'default' }}
                                                >
                                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                                        {row.transactionNumber ?? '—'}
                                                    </TableCell>
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
                                                    <TableCell
                                                        align="right"
                                                        sx={{ py: 0, px: 0.5, whiteSpace: 'nowrap' }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Stack direction="row" spacing={0} justifyContent="flex-end">
                                                            {!row.isSubtransaction && (isStaff || mutable) ? (
                                                                <Tooltip title={t('accountancy.addSubtransaction')}>
                                                                    <IconButton
                                                                        size="small"
                                                                        color="secondary"
                                                                        onClick={() => openSubtransactionDialog(row)}
                                                                        aria-label={t('accountancy.addSubtransaction')}
                                                                    >
                                                                        <SubdirectoryArrowRightIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            ) : null}
                                                            {mutable ? (
                                                                <Tooltip title={t('common.edit')}>
                                                                    <IconButton
                                                                        component={Link}
                                                                        href={transactionHref(row)}
                                                                        size="small"
                                                                        aria-label={t('common.edit')}
                                                                    >
                                                                        <EditIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            ) : null}
                                                            {mutable ? (
                                                                <Tooltip title={t('common.delete')}>
                                                                    <IconButton
                                                                        size="small"
                                                                        color="error"
                                                                        onClick={() => handleDelete(row)}
                                                                        aria-label={t('common.delete')}
                                                                    >
                                                                        <DeleteIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            ) : null}
                                                        </Stack>
                                                    </TableCell>
                                                </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Box>
            )}
            <QuickSubtransactionDialog
                open={subtransactionParent != null}
                parent={subtransactionParent}
                counterparties={counterparties}
                usersWithCashflow={usersWithCashflow}
                cashflows={allCashflows}
                onClose={() => setSubtransactionParent(null)}
                onCreated={(created) => {
                    const accountantId = created.record.accountantId || currentUserId;
                    if (created.type === 'expense') {
                        setExpenses((prev) => [{ ...(created.record as Expense), accountantId }, ...prev]);
                        return;
                    }
                    setIncomes((prev) => [{ ...(created.record as Income), accountantId }, ...prev]);
                }}
            />
        </Box>
    );
}

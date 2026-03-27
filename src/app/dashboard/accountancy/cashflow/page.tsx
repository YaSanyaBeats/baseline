'use client';

import {
    Box,
    Button,
    Typography,
    Alert,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    IconButton,
    Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cashflow, CashflowRule, Expense, Income } from '@/lib/types';
import { getCashflows, deleteCashflow } from '@/lib/cashflows';
import {
    getCashflowRules,
    addCashflowRule,
    updateCashflowRule,
    deleteCashflowRule,
} from '@/lib/cashflowRules';
import { getCounterparties } from '@/lib/counterparties';
import { getExpenses } from '@/lib/expenses';
import { getIncomes } from '@/lib/incomes';
import { getExpenseSum, getBalanceByRule, type ObjectWithMeta } from '@/lib/accountancyUtils';
import { getBookingsByIds } from '@/lib/bookings';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';
import CashflowRuleDialog from '@/components/accountancy/CashflowRuleDialog';

const CASHFLOW_TYPE_KEYS: Record<string, string> = {
    company: 'typeCompany',
    employee: 'typeEmployee',
    room: 'typeRoom',
    object: 'typeObject',
    premium: 'typePremium',
    other: 'typeOther',
};

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();
    const { setSnackbar } = useSnackbar();

    const [cashflows, setCashflows] = useState<Cashflow[]>([]);
    const [counterparties, setCounterparties] = useState<{ _id: string; name: string }[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [rules, setRules] = useState<CashflowRule[]>([]);
    const [categories, setCategories] = useState<{ _id: string; name: string; type: string }[]>([]);
    const [bookingsForRules, setBookingsForRules] = useState<{ id: number; arrival: string; departure: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
    const [ruleEditing, setRuleEditing] = useState<CashflowRule | null>(null);

    const hasAccess = isAdmin || isAccountant;

    const loadData = async () => {
        try {
            const [cashflowsList, counterpartiesList, expensesList, incomesList, rulesList, categoriesList] =
                await Promise.all([
                    getCashflows(),
                    getCounterparties(),
                    getExpenses(),
                    getIncomes(),
                    getCashflowRules(),
                    getAccountancyCategories(),
                ]);
            setCashflows(cashflowsList);
            setCounterparties(counterpartiesList.map((c) => ({ _id: c._id!, name: c.name })));
            setExpenses(expensesList);
            setIncomes(incomesList);
            setRules(rulesList);
            setCategories(
                (categoriesList ?? []).map((c) => ({
                    _id: c._id ?? '',
                    name: c.name,
                    type: c.type ?? 'expense',
                }))
            );

            const bookingIds = Array.from(
                new Set([
                    ...expensesList.map((e) => e.bookingId).filter((id): id is number => typeof id === 'number'),
                    ...incomesList.map((i) => i.bookingId).filter((id): id is number => typeof id === 'number'),
                ])
            );
            if (bookingIds.length > 0) {
                const list = await getBookingsByIds(bookingIds);
                setBookingsForRules(list.map((b) => ({ id: b.id, arrival: b.arrival, departure: b.departure })));
            } else {
                setBookingsForRules([]);
            }
        } catch (error) {
            console.error('Error loading cashflows:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!hasAccess) return;
        loadData();
    }, [hasAccess]);

    const formatAmount = (value: number): string => {
        return value.toLocaleString('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const balanceByCashflow = cashflows.reduce<Record<string, number>>((acc, cf) => {
        if (!cf._id) return acc;
        const expenseSum = expenses
            .filter((e) => e.cashflowId === cf._id)
            .reduce((s, e) => s + getExpenseSum(e), 0);
        const incomeSum = incomes
            .filter((i) => i.cashflowId === cf._id)
            .reduce((s, i) => s + (i.amount ?? 0) * (i.quantity ?? 1), 0);
        acc[cf._id] = incomeSum - expenseSum;
        return acc;
    }, {});

    const getRoomLinksLabel = (roomLinks: { id: number; rooms: number[] }[]) => {
        if (!roomLinks?.length) return '—';
        return roomLinks
            .map((link) => {
                const obj = objects.find((o) => o.id === link.id);
                const objName = obj?.name ?? `Объект ${link.id}`;
                const roomNames = link.rooms
                    .map((rid) => {
                        const room = obj?.roomTypes?.find((r) => r.id === rid);
                        return room?.name ?? rid;
                    })
                    .join(', ');
                return `${objName}: ${roomNames}`;
            })
            .join('; ');
    };

    const getTypeLabel = (type: string) => {
        const key = CASHFLOW_TYPE_KEYS[type] ?? 'typeOther';
        return t(`accountancy.cashflow.${key}`);
    };

    const getCounterpartyNames = (counterpartyIds: string[] | undefined) => {
        if (!counterpartyIds?.length) return '—';
        return counterpartyIds
            .map((id) => counterparties.find((c) => c._id === id)?.name ?? id)
            .join(', ');
    };

    const handleDelete = (cf: Cashflow) => {
        if (!cf._id) return;
        if (!window.confirm(t('accountancy.cashflow.deleteConfirm'))) return;

        deleteCashflow(cf._id)
            .then((res) => {
                setSnackbar({
                    open: true,
                    message: res.message,
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) {
                    setCashflows((prev) => prev.filter((c) => c._id !== cf._id));
                }
            })
            .catch(() => {
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
            });
    };

    const objectsForRules: ObjectWithMeta[] = objects.map((o) => ({
        id: o.id,
        name: o.name,
        district: o.district,
        objectType: o.objectType,
        roomTypes: o.roomTypes?.map((rt) => ({
            id: rt.id,
            name: rt.name,
            bedrooms: rt.bedrooms,
            bathrooms: rt.bathrooms,
            livingRoomSofas: rt.livingRoomSofas,
            kitchen: rt.kitchen,
            level: rt.level,
            commissionSchemeId: rt.commissionSchemeId,
            internetProviderCounterpartyId: rt.internetProviderCounterpartyId,
            internetCostPerMonth: rt.internetCostPerMonth,
        })),
    }));

    const handleSaveRule = async (
        rule: CashflowRule | Omit<CashflowRule, '_id' | 'createdAt'>
    ): Promise<{ success: boolean; message: string }> => {
        const isUpdate = '_id' in rule && rule._id;
        const res = isUpdate
            ? await updateCashflowRule(rule as CashflowRule)
            : await addCashflowRule(rule as Omit<CashflowRule, '_id' | 'createdAt'>);
        setSnackbar({
            open: true,
            message: res.message,
            severity: res.success ? 'success' : 'error',
        });
        return res;
    };

    const handleDeleteRule = (rule: CashflowRule) => {
        if (!rule._id) return;
        if (!window.confirm(t('accountancy.cashflow.ruleDeleteConfirm'))) return;
        deleteCashflowRule(rule._id)
            .then((res) => {
                setSnackbar({
                    open: true,
                    message: res.message,
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success) loadData();
            })
            .catch(() => {
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
            });
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.cashflow.title')}</Typography>
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">{t('accountancy.cashflow.title')}</Typography>
                <Link href="/dashboard/accountancy/cashflow/add">
                    <Button variant="contained" startIcon={<AddIcon />}>
                        {t('accountancy.cashflow.add')}
                    </Button>
                </Link>
            </Box>

            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : cashflows.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">{t('accountancy.cashflow.noCashflows')}</Typography>
                    <Link href="/dashboard/accountancy/cashflow/add">
                        <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }}>
                            {t('accountancy.cashflow.add')}
                        </Button>
                    </Link>
                </Paper>
            ) : (
                <Paper variant="outlined" sx={{ overflow: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('accountancy.cashflow.name')}</TableCell>
                                <TableCell>{t('accountancy.cashflow.type')}</TableCell>
                                <TableCell>{t('accountancy.cashflow.rooms')}</TableCell>
                                <TableCell>{t('accountancy.cashflow.counterparties')}</TableCell>
                                <TableCell>{t('accountancy.cashflow.balance')}</TableCell>
                                <TableCell>{t('accountancy.comment')}</TableCell>
                                <TableCell width={100} align="right">
                                    {t('accountancy.actions')}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {cashflows.map((cf) => {
                                const balance = balanceByCashflow[cf._id!] ?? 0;
                                return (
                                    <TableRow key={cf._id}>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={500}>
                                                {cf.name}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip size="small" label={getTypeLabel(cf.type)} variant="outlined" />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 280 }}>
                                                {getRoomLinksLabel(cf.roomLinks ?? [])}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200 }}>
                                                {getCounterpartyNames(cf.counterpartyIds)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color:
                                                        balance > 0
                                                            ? 'success.main'
                                                            : balance < 0
                                                              ? 'error.main'
                                                              : 'text.secondary',
                                                }}
                                            >
                                                {formatAmount(balance)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200 }}>
                                                {cf.comment || '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Link href={`/dashboard/accountancy/cashflow/edit/${cf._id}`}>
                                                <IconButton size="small" aria-label={t('accountancy.editCategory')}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Link>
                                            <IconButton
                                                size="small"
                                                aria-label={t('common.delete')}
                                                onClick={() => handleDelete(cf)}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            <Box sx={{ mt: 4 }}>
                <Typography variant="h5" sx={{ mb: 1 }}>
                    {t('accountancy.cashflow.rulesTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {t('accountancy.cashflow.rulesDescription')}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                    <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={() => {
                            setRuleEditing(null);
                            setRuleDialogOpen(true);
                        }}
                    >
                        {t('accountancy.cashflow.addRule')}
                    </Button>
                </Box>
                {rules.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography color="text.secondary">
                            {t('accountancy.cashflow.noRules')}
                        </Typography>
                        <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            sx={{ mt: 2 }}
                            onClick={() => {
                                setRuleEditing(null);
                                setRuleDialogOpen(true);
                            }}
                        >
                            {t('accountancy.cashflow.addRule')}
                        </Button>
                    </Paper>
                ) : (
                    <Paper variant="outlined" sx={{ overflow: 'auto' }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('accountancy.cashflow.ruleName')}</TableCell>
                                    <TableCell>{t('accountancy.cashflow.filterLogic')}</TableCell>
                                    <TableCell>{t('accountancy.cashflow.filters')}</TableCell>
                                    <TableCell>{t('accountancy.cashflow.balance')}</TableCell>
                                    <TableCell width={100} align="right">
                                        {t('accountancy.actions')}
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rules.map((rule) => {
                                    const result = getBalanceByRule(
                                        rule,
                                        expenses,
                                        incomes,
                                        objectsForRules,
                                        bookingsForRules
                                    );
                                    const balance = result.balance;
                                    return (
                                        <TableRow key={rule._id}>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={500}>
                                                    {rule.name}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    label={
                                                        rule.filterLogic === 'and'
                                                            ? t('accountancy.cashflow.filterLogicAnd')
                                                            : t('accountancy.cashflow.filterLogicOr')
                                                    }
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary">
                                                    {rule.filters?.length ?? 0}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color:
                                                            balance > 0
                                                                ? 'success.main'
                                                                : balance < 0
                                                                  ? 'error.main'
                                                                  : 'text.secondary',
                                                    }}
                                                >
                                                    {balance !== 0 && result.balanceSign === 'plus' ? '+' : ''}
                                                    {formatAmount(balance)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <IconButton
                                                    size="small"
                                                    aria-label={t('accountancy.editCategory')}
                                                    onClick={() => {
                                                        setRuleEditing(rule);
                                                        setRuleDialogOpen(true);
                                                    }}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    aria-label={t('common.delete')}
                                                    onClick={() => handleDeleteRule(rule)}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </Paper>
                )}
            </Box>

            <CashflowRuleDialog
                open={ruleDialogOpen}
                onClose={() => {
                    setRuleDialogOpen(false);
                    setRuleEditing(null);
                }}
                initialRule={ruleEditing}
                onSaved={loadData}
                counterparties={counterparties}
                categories={categories}
                objects={objects.map((o) => ({ id: o.id, name: o.name, district: o.district, objectType: o.objectType }))}
                onSave={handleSaveRule}
            />
        </Box>
    );
}

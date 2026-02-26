'use client';

import {
    Box,
    Button,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
    Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { useUser } from '@/providers/UserProvider';
import { useObjects } from '@/providers/ObjectsProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import {
    getAutoAccountingRules,
    createAutoAccountingRule,
    updateAutoAccountingRule,
    deleteAutoAccountingRule,
    runAutoAccountingForUnprocessed,
    getAutoAccountingStatus,
} from '@/lib/autoAccounting';
import { getAccountancyCategories } from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';
import type { AutoAccountingRule as AutoRule, AutoAccountingAmountSource } from '@/lib/types';

const PERIOD_OPTIONS: { value: AutoRule['period']; labelKey: string }[] = [
    { value: 'per_booking', labelKey: 'accountancy.autoAccounting.periodPerBooking' },
    { value: 'per_month', labelKey: 'accountancy.autoAccounting.periodPerMonth' },
];

export default function AutoAccountingPage() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();
    const { setSnackbar } = useSnackbar();
    const [rules, setRules] = useState<AutoRule[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<{ id: string; name: string; depth: number }[]>([]);
    const [incomeCategories, setIncomeCategories] = useState<{ id: string; name: string; depth: number }[]>([]);
    const [unprocessedCount, setUnprocessedCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({
        ruleType: 'expense' as 'expense' | 'income',
        objectId: 'all' as number | 'all',
        roomId: 'all' as number | 'all',
        category: '',
        quantity: 1,
        amount: '' as number | '',
        amountSource: 'manual' as AutoAccountingAmountSource,
        period: 'per_booking' as AutoRule['period'],
        order: 0,
    });

    const hasAccess = isAdmin || isAccountant;

    const loadRules = useCallback(async () => {
        if (!hasAccess) return;
        try {
            const list = await getAutoAccountingRules();
            setRules(list);
        } catch (e) {
            console.error(e);
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        }
    }, [hasAccess, setSnackbar, t]);

    const loadStatus = useCallback(async () => {
        if (!hasAccess) return;
        try {
            const st = await getAutoAccountingStatus();
            if (st.success && typeof st.unprocessedBookingCount === 'number') {
                setUnprocessedCount(st.unprocessedBookingCount);
            }
        } catch {
            // ignore
        }
    }, [hasAccess]);

    useEffect(() => {
        if (!hasAccess) {
            setLoading(false);
            return;
        }
        setLoading(true);
        Promise.all([
            getAccountancyCategories(),
            loadRules(),
            loadStatus(),
        ]).then(([categories]) => {
            const expense = buildCategoriesForSelect(categories, 'expense');
            const income = buildCategoriesForSelect(categories, 'income');
            setExpenseCategories(expense);
            setIncomeCategories(income);
        }).catch(console.error).finally(() => setLoading(false));
    }, [hasAccess]);

    useEffect(() => {
        if (!hasAccess) return;
        loadStatus();
    }, [hasAccess, loadRules, loadStatus]);

    const categoriesByType = form.ruleType === 'expense' ? expenseCategories : incomeCategories;

    const selectedObject = typeof form.objectId === 'number' ? objects.find((o) => o.id === form.objectId) : null;
    const rooms = selectedObject?.roomTypes ?? [];

    const handleSaveRule = async () => {
        if (!form.category.trim()) {
            setSnackbar({ open: true, message: t('accountancy.autoAccounting.categoryLabel') + ' — обязательное поле', severity: 'warning' });
            return;
        }
        const objectId = form.objectId === 'all' ? 'all' : Number(form.objectId);
        const roomId = form.objectId === 'all' ? undefined : (form.roomId === 'all' ? 'all' : Number(form.roomId));
        const amount = form.amountSource === 'manual' && form.amount !== '' ? Number(form.amount) : undefined;
        if (editingId) {
            const res = await updateAutoAccountingRule(editingId, {
                ruleType: form.ruleType,
                objectId: typeof objectId === 'number' ? objectId : 'all',
                ...(roomId !== undefined && { roomId }),
                category: form.category.trim(),
                quantity: form.quantity,
                amount,
                amountSource: form.amountSource,
                period: form.period,
                order: form.order,
            });
            setSnackbar({ open: true, message: res.message, severity: res.success ? 'success' : 'error' });
            if (res.success) {
                setEditingId(null);
                setFormOpen(false);
                loadRules();
            }
        } else {
            const res = await createAutoAccountingRule({
                ruleType: form.ruleType,
                objectId: typeof objectId === 'number' ? objectId : 'all',
                ...(roomId !== undefined && { roomId }),
                category: form.category.trim(),
                quantity: form.quantity,
                amount,
                amountSource: form.amountSource,
                period: form.period,
                order: form.order,
            });
            setSnackbar({ open: true, message: res.message, severity: res.success ? 'success' : 'error' });
            if (res.success) {
                setFormOpen(false);
                loadRules();
            }
        }
    };

    const handleDeleteRule = async (id: string) => {
        if (!window.confirm(t('accountancy.autoAccounting.deleteRuleConfirm'))) return;
        const res = await deleteAutoAccountingRule(id);
        setSnackbar({ open: true, message: res.message, severity: res.success ? 'success' : 'error' });
        if (res.success) loadRules();
    };

    const handleRunForNew = async () => {
        setRunning(true);
        try {
            const res = await runAutoAccountingForUnprocessed();
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            if (res.success && res.created) {
                setUnprocessedCount(0);
                loadStatus();
            }
        } catch (e) {
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        } finally {
            setRunning(false);
        }
    };

    const AMOUNT_SOURCE_OPTIONS: { value: AutoAccountingAmountSource; labelKey: string }[] = [
        { value: 'manual', labelKey: 'accountancy.autoAccounting.amountSourceManual' },
        { value: 'booking_price', labelKey: 'accountancy.autoAccounting.amountSourceBookingPrice' },
        { value: 'internet_cost', labelKey: 'accountancy.autoAccounting.amountSourceInternetCost' },
        { value: 'category', labelKey: 'accountancy.autoAccounting.amountSourceCategory' },
    ];

    const openAdd = () => {
        setEditingId(null);
        setForm({
            ruleType: 'expense',
            objectId: 'all',
            roomId: 'all',
            category: '',
            quantity: 1,
            amount: '',
            amountSource: 'manual',
            period: 'per_booking',
            order: rules.length,
        });
        setFormOpen(true);
    };

    const openEdit = (r: AutoRule) => {
        if (!r._id) return;
        setEditingId(r._id);
        setForm({
            ruleType: r.ruleType,
            objectId: r.objectId,
            roomId: r.roomId ?? 'all',
            category: r.category,
            quantity: r.quantity,
            amount: r.amount ?? '',
            amountSource: r.amountSource ?? 'manual',
            period: r.period,
            order: r.order,
        });
        setFormOpen(true);
    };

    const objectLabel = (objectId: number | 'all') =>
        objectId === 'all' ? t('accountancy.autoAccounting.objectAll') : (objects.find((o) => o.id === objectId)?.name ?? String(objectId));

    const roomLabel = (rule: AutoRule) => {
        if (rule.objectId === 'all' || rule.roomId === undefined) return '—';
        if (rule.roomId === 'all') return t('accountancy.autoAccounting.roomAll');
        const obj = objects.find((o) => o.id === rule.objectId);
        const room = obj?.roomTypes?.find((rt) => rt.id === rule.roomId);
        return room?.name ?? String(rule.roomId);
    };

    const amountSourceLabel = (source: AutoAccountingAmountSource | undefined) => {
        if (!source) return '—';
        const opt = AMOUNT_SOURCE_OPTIONS.find((o) => o.value === source);
        return opt ? t(opt.labelKey) : source;
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.autoAccounting.title')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>{t('accountancy.noAccess')}</Alert>
            </Box>
        );
    }

    return (
        <>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>{t('common.back')}</Button>
                </Link>
            </Box>
            <Typography variant="h4" sx={{ mb: 1 }}>{t('accountancy.autoAccounting.title')}</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
                {t('accountancy.autoAccounting.description')}
            </Typography>

            <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
                <Button
                    variant="outlined"
                    startIcon={<PlayArrowIcon />}
                    onClick={handleRunForNew}
                    disabled={running || unprocessedCount === 0}
                >
                    {unprocessedCount > 0
                        ? t('accountancy.autoAccounting.runForNewBookingsCount').replace('{{count}}', String(unprocessedCount))
                        : t('accountancy.autoAccounting.runForNewBookings')}
                </Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
                    {t('accountancy.autoAccounting.addRule')}
                </Button>
            </Stack>

            {formOpen && (
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        {editingId ? t('accountancy.autoAccounting.editRule') : t('accountancy.autoAccounting.addRule')}
                    </Typography>
                    <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap">
                        <FormControl sx={{ minWidth: 140 }}>
                            <InputLabel>{t('accountancy.autoAccounting.ruleType')}</InputLabel>
                            <Select
                                value={form.ruleType}
                                label={t('accountancy.autoAccounting.ruleType')}
                                onChange={(e) => setForm((f) => ({ ...f, ruleType: e.target.value as 'expense' | 'income' }))}
                            >
                                <MenuItem value="expense">{t('accountancy.autoAccounting.ruleTypeExpense')}</MenuItem>
                                <MenuItem value="income">{t('accountancy.autoAccounting.ruleTypeIncome')}</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl sx={{ minWidth: 180 }}>
                            <InputLabel>{t('accountancy.autoAccounting.objectFilter')}</InputLabel>
                            <Select
                                value={form.objectId === 'all' ? 'all' : String(form.objectId)}
                                label={t('accountancy.autoAccounting.objectFilter')}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setForm((f) => ({ ...f, objectId: v === 'all' ? 'all' : Number(v), roomId: 'all' }));
                                }}
                            >
                                <MenuItem value="all">{t('accountancy.autoAccounting.objectAll')}</MenuItem>
                                {objects.map((o) => (
                                    <MenuItem key={o.id} value={String(o.id)}>{o.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {selectedObject && (
                            <FormControl sx={{ minWidth: 180 }}>
                                <InputLabel>{t('accountancy.autoAccounting.roomFilter')}</InputLabel>
                                <Select
                                    value={form.roomId === 'all' ? 'all' : String(form.roomId)}
                                    label={t('accountancy.autoAccounting.roomFilter')}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setForm((f) => ({ ...f, roomId: v === 'all' ? 'all' : Number(v) }));
                                    }}
                                >
                                    <MenuItem value="all">{t('accountancy.autoAccounting.roomAll')}</MenuItem>
                                    {rooms.map((room) => (
                                        <MenuItem key={room.id} value={String(room.id)}>{room.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        <FormControl sx={{ minWidth: 200 }}>
                            <InputLabel>{t('accountancy.autoAccounting.categoryLabel')}</InputLabel>
                            <Select
                                value={form.category}
                                label={t('accountancy.autoAccounting.categoryLabel')}
                                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                            >
                                {categoriesByType.map((c) => (
                                    <MenuItem key={c.id} value={c.name}>
                                        {'\u00A0'.repeat(c.depth * 2)}{c.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label={t('accountancy.autoAccounting.quantityLabel')}
                            type="number"
                            inputProps={{ min: 1 }}
                            value={form.quantity}
                            onChange={(e) => setForm((f) => ({ ...f, quantity: Math.max(1, Number(e.target.value) || 1) }))}
                            sx={{ width: 100 }}
                        />
                        <FormControl sx={{ minWidth: 220 }}>
                            <InputLabel>{t('accountancy.autoAccounting.amountSourceLabel')}</InputLabel>
                            <Select
                                value={form.amountSource}
                                label={t('accountancy.autoAccounting.amountSourceLabel')}
                                onChange={(e) => setForm((f) => ({ ...f, amountSource: e.target.value as AutoAccountingAmountSource }))}
                            >
                                {AMOUNT_SOURCE_OPTIONS.map((opt) => (
                                    <MenuItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {form.amountSource === 'manual' && (
                            <TextField
                                label={t('accountancy.autoAccounting.amountLabel')}
                                type="number"
                                inputProps={{ min: 0, step: 0.01 }}
                                value={form.amount}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setForm((f) => ({ ...f, amount: v === '' ? '' : Number(v) }));
                                }}
                                sx={{ width: 140 }}
                            />
                        )}
                        <FormControl sx={{ minWidth: 200 }}>
                            <InputLabel>{t('accountancy.autoAccounting.periodLabel')}</InputLabel>
                            <Select
                                value={form.period}
                                label={t('accountancy.autoAccounting.periodLabel')}
                                onChange={(e) => setForm((f) => ({ ...f, period: e.target.value as AutoRule['period'] }))}
                            >
                                {PERIOD_OPTIONS.map((opt) => (
                                    <MenuItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label={t('accountancy.autoAccounting.orderLabel')}
                            type="number"
                            value={form.order}
                            onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) || 0 }))}
                            sx={{ width: 80 }}
                        />
                        <Button variant="contained" onClick={handleSaveRule}>{t('common.save')}</Button>
                        <Button variant="outlined" onClick={() => { setFormOpen(false); setEditingId(null); }}>{t('common.cancel')}</Button>
                    </Stack>
                </Paper>
            )}

            <Typography variant="h6" sx={{ mb: 1 }}>{t('accountancy.autoAccounting.rulesTitle')}</Typography>
            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('accountancy.autoAccounting.ruleType')}</TableCell>
                                <TableCell>{t('accountancy.autoAccounting.objectFilter')}</TableCell>
                                <TableCell>{t('accountancy.autoAccounting.roomFilter')}</TableCell>
                                <TableCell>{t('accountancy.autoAccounting.categoryLabel')}</TableCell>
                                <TableCell align="right">{t('accountancy.autoAccounting.quantityLabel')}</TableCell>
                                <TableCell>{t('accountancy.autoAccounting.amountSourceLabel')}</TableCell>
                                <TableCell align="right">{t('accountancy.autoAccounting.amountLabel')}</TableCell>
                                <TableCell>{t('accountancy.autoAccounting.periodLabel')}</TableCell>
                                <TableCell align="right">{t('accountancy.autoAccounting.orderLabel')}</TableCell>
                                <TableCell width={80}></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rules.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={10} align="center" color="text.secondary">
                                        {t('accountancy.autoAccounting.noRules')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rules.map((r) => (
                                    <TableRow key={r._id!}>
                                        <TableCell>{r.ruleType === 'expense' ? t('accountancy.autoAccounting.ruleTypeExpense') : t('accountancy.autoAccounting.ruleTypeIncome')}</TableCell>
                                        <TableCell>{objectLabel(r.objectId)}</TableCell>
                                        <TableCell>{roomLabel(r)}</TableCell>
                                        <TableCell>{r.category}</TableCell>
                                        <TableCell align="right">{r.quantity}</TableCell>
                                        <TableCell>{amountSourceLabel(r.amountSource)}</TableCell>
                                        <TableCell align="right">{(r.amountSource === 'manual' && r.amount != null) ? r.amount : '—'}</TableCell>
                                        <TableCell>{r.period === 'per_booking' ? t('accountancy.autoAccounting.periodPerBooking') : t('accountancy.autoAccounting.periodPerMonth')}</TableCell>
                                        <TableCell align="right">{r.order}</TableCell>
                                        <TableCell>
                                            <IconButton size="small" onClick={() => openEdit(r)} aria-label={t('accountancy.autoAccounting.editRule')}>
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton size="small" onClick={() => handleDeleteRule(r._id!)} aria-label={t('common.delete')}>
                                                <DeleteOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </>
    );
}

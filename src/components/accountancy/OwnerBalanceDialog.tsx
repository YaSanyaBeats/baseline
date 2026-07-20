'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Paper,
    Typography,
    Box,
    Stack,
    Chip,
    Tabs,
    Tab,
    ToggleButton,
    ToggleButtonGroup,
} from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import BarChartIcon from '@mui/icons-material/BarChart';
import StackedBarChartIcon from '@mui/icons-material/StackedBarChart';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { ownerBalanceSignedLineAmount } from '@/lib/ownerViewSettlements';
import { ownerBalanceCategoryKind } from '@/lib/ownerBalanceCategories';
import { filterObjectsForOwner } from '@/lib/ownerObjectsFilter';
import { getExpenseSum, getIncomeSum } from '@/lib/accountancyUtils';
import { isExcludedFromAccountancyRoomStatsSum } from '@/lib/noBookingCategorySubgroups';
import type { User, Object as PropertyObject, Income, Expense } from '@/lib/types';

export type OwnerBalanceLedgerRow = {
    _id: string;
    recordType: 'expense' | 'income';
    date: Date | string;
    category: string;
    objectId: number;
    roomName?: string | null;
    reportMonth?: string;
    status: 'draft' | 'confirmed';
    quantity?: number;
    amount: number;
};

type ChartViewMode = 'line' | 'columns' | 'histogram';

type OwnerRoomTab = {
    key: string;
    objectId: number;
    objectName: string;
    roomName: string;
};

interface OwnerBalanceDialogProps {
    open: boolean;
    onClose: () => void;
    owner: User | null;
    transactions: OwnerBalanceLedgerRow[];
    incomes: Income[];
    expenses: Expense[];
    objects: PropertyObject[];
    t: (key: string) => string;
}

function formatAmount(value: number): string {
    return value.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatDate(d: Date | string): string {
    const date = new Date(d);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function getMonthKeyFromDate(d: Date | string): string {
    const date = new Date(d);
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${m}`;
}

function ledgerMonthFromRecord(
    date: Date | string | undefined,
    reportMonth: string | undefined | null
): string | null {
    const rm = (reportMonth ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(rm)) return rm;
    if (date == null) return null;
    return getMonthKeyFromDate(date);
}

function formatMonthLabel(monthKey: string): string {
    const [y, m] = monthKey.split('-');
    return `${m}.${y}`;
}

function signedLineAmount(row: OwnerBalanceLedgerRow): number {
    return ownerBalanceSignedLineAmount(row.category, row);
}

function signedAmountColor(value: number): 'success.main' | 'error.main' | 'text.secondary' {
    if (value > 0) return 'success.main';
    if (value < 0) return 'error.main';
    return 'text.secondary';
}

function formatSignedAmount(value: number): string {
    const sign = value >= 0 ? '+' : '−';
    return `${sign}${formatAmount(Math.abs(value))}`;
}

function SignedAmountText({ value, fontWeight }: { value: number; fontWeight?: number }) {
    return (
        <Typography
            component="span"
            sx={{ color: signedAmountColor(value), fontWeight: fontWeight ?? 400 }}
        >
            {formatSignedAmount(value)}
        </Typography>
    );
}

function roomLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id ?? ''}`;
}

function recordMatchesRoom(
    record: { objectId: number; roomName?: string | null },
    room: OwnerRoomTab,
    objects: PropertyObject[]
): boolean {
    const rn = (record.roomName ?? '').trim();
    if (!rn || rn !== room.roomName) return false;
    if (record.objectId === room.objectId) return true;
    const obj = objects.find((o) => o.id === room.objectId);
    if (!obj) return false;
    return record.objectId === obj.id || record.objectId === obj.propertyId;
}

function expandMonthKeys(monthKeys: string[]): string[] {
    if (monthKeys.length === 0) return [];
    const sorted = [...monthKeys].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const [firstYearStr, firstMonthStr] = first.split('-');
    const [lastYearStr, lastMonthStr] = last.split('-');
    const firstYear = Number(firstYearStr);
    const firstMonth = Number(firstMonthStr);
    const lastYear = Number(lastYearStr);
    const lastMonth = Number(lastMonthStr);

    const keys: string[] = [];
    let y = firstYear;
    let m = firstMonth;
    while (y < lastYear || (y === lastYear && m <= lastMonth)) {
        keys.push(`${y}-${String(m).padStart(2, '0')}`);
        m += 1;
        if (m > 12) {
            m = 1;
            y += 1;
        }
    }
    return keys;
}

function amountFormatter(v: number | null): string {
    return v == null ? '' : formatAmount(v);
}

function RoomMetricChart({
    title,
    labels,
    series,
    viewMode,
    emptyLabel,
}: {
    title: string;
    labels: string[];
    series: { id: string; label: string; data: number[]; color?: string }[];
    viewMode: ChartViewMode;
    emptyLabel: string;
}) {
    const hasData = labels.length > 0 && series.some((s) => s.data.some((v) => v !== 0));

    return (
        <Box>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
                {title}
            </Typography>
            {!hasData ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">{emptyLabel}</Typography>
                </Paper>
            ) : (
                <Box sx={{ width: '100%', overflow: 'auto' }}>
                    {viewMode === 'line' ? (
                        <LineChart
                            xAxis={[{ data: labels, scaleType: 'point' }]}
                            series={series.map((s) => ({
                                id: s.id,
                                label: s.label,
                                data: s.data,
                                color: s.color,
                                valueFormatter: amountFormatter,
                                showMark: true,
                            }))}
                            height={260}
                            margin={{ left: 80, right: 30, top: 30, bottom: 50 }}
                            grid={{ horizontal: true }}
                        />
                    ) : viewMode === 'histogram' ? (
                        <LineChart
                            xAxis={[{ data: labels, scaleType: 'point' }]}
                            series={series.map((s) => ({
                                id: s.id,
                                label: s.label,
                                data: s.data,
                                color: s.color,
                                valueFormatter: amountFormatter,
                                area: true,
                                showMark: false,
                                curve: 'step',
                            }))}
                            height={260}
                            margin={{ left: 80, right: 30, top: 30, bottom: 50 }}
                            grid={{ horizontal: true }}
                        />
                    ) : (
                        <BarChart
                            xAxis={[{ data: labels, scaleType: 'band' }]}
                            series={series.map((s) => ({
                                id: s.id,
                                label: s.label,
                                data: s.data,
                                color: s.color,
                                valueFormatter: amountFormatter,
                            }))}
                            height={260}
                            margin={{ left: 80, right: 30, top: 30, bottom: 50 }}
                            grid={{ horizontal: true }}
                        />
                    )}
                </Box>
            )}
        </Box>
    );
}

export default function OwnerBalanceDialog({
    open,
    onClose,
    owner,
    transactions,
    incomes,
    expenses,
    objects,
    t,
}: OwnerBalanceDialogProps) {
    const [selectedRoomKey, setSelectedRoomKey] = useState('');
    const [chartViewMode, setChartViewMode] = useState<ChartViewMode>('columns');

    const sortedTx = useMemo(() => {
        return [...transactions].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
    }, [transactions]);

    const roomTabs = useMemo((): OwnerRoomTab[] => {
        const map = new Map<string, OwnerRoomTab>();

        const upsert = (objectId: number, roomNameRaw: string) => {
            const roomName = roomNameRaw.trim();
            if (!roomName || roomName === '—') return;
            const obj = objects.find(
                (o) => o.id === objectId || o.propertyId === objectId
            );
            const resolvedObjectId = obj?.id ?? objectId;
            const objectName = obj?.name ?? `${resolvedObjectId}`;
            const key = `${resolvedObjectId}::${roomName}`;
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    objectId: resolvedObjectId,
                    objectName,
                    roomName,
                });
            }
        };

        if (owner) {
            for (const obj of filterObjectsForOwner(objects, owner.objects ?? [])) {
                for (const room of obj.roomTypes ?? []) {
                    upsert(obj.id, roomLabel(room));
                }
            }
        }

        for (const tx of sortedTx) {
            upsert(tx.objectId, (tx.roomName ?? '').trim() || '—');
        }
        for (const i of incomes) {
            upsert(i.objectId, (i.roomName ?? '').trim() || '—');
        }
        for (const e of expenses) {
            upsert(e.objectId, (e.roomName ?? '').trim() || '—');
        }

        return Array.from(map.values()).sort((a, b) => {
            const byObj = a.objectName.localeCompare(b.objectName, 'ru');
            if (byObj !== 0) return byObj;
            return a.roomName.localeCompare(b.roomName, 'ru');
        });
    }, [owner, objects, sortedTx, incomes, expenses]);

    useEffect(() => {
        if (!open) return;
        setSelectedRoomKey((prev) => {
            if (prev && roomTabs.some((r) => r.key === prev)) return prev;
            return roomTabs[0]?.key ?? '';
        });
    }, [open, owner?._id, roomTabs]);

    const selectedRoom = useMemo(
        () => roomTabs.find((r) => r.key === selectedRoomKey) ?? null,
        [roomTabs, selectedRoomKey]
    );

    const roomChartData = useMemo(() => {
        if (!selectedRoom) {
            return {
                labels: [] as string[],
                revenue: [] as number[],
                expenses: [] as number[],
                accrued: [] as number[],
                debited: [] as number[],
            };
        }

        const revenueByMonth = new Map<string, number>();
        const expensesByMonth = new Map<string, number>();
        const accruedByMonth = new Map<string, number>();
        const debitedByMonth = new Map<string, number>();

        for (const i of incomes) {
            if (!recordMatchesRoom(i, selectedRoom, objects)) continue;
            const month = ledgerMonthFromRecord(i.date, i.reportMonth);
            if (!month) continue;
            if (isExcludedFromAccountancyRoomStatsSum(i.categoryId, month)) continue;
            revenueByMonth.set(month, (revenueByMonth.get(month) ?? 0) + getIncomeSum(i));
        }

        for (const e of expenses) {
            if (!recordMatchesRoom(e, selectedRoom, objects)) continue;
            const month = ledgerMonthFromRecord(e.date, e.reportMonth);
            if (!month) continue;
            if (isExcludedFromAccountancyRoomStatsSum(e.categoryId, month)) continue;
            expensesByMonth.set(month, (expensesByMonth.get(month) ?? 0) + getExpenseSum(e));
        }

        for (const tx of sortedTx) {
            if (!recordMatchesRoom(tx, selectedRoom, objects)) continue;
            const month = ledgerMonthFromRecord(tx.date, tx.reportMonth);
            if (!month) continue;
            const kind = ownerBalanceCategoryKind(tx.category);
            const line = Math.abs((tx.quantity ?? 1) * (tx.amount ?? 0));
            if (kind === 'accrued') {
                accruedByMonth.set(month, (accruedByMonth.get(month) ?? 0) + line);
            } else if (kind === 'debited') {
                debitedByMonth.set(month, (debitedByMonth.get(month) ?? 0) + line);
            }
        }

        const keys = expandMonthKeys([
            ...revenueByMonth.keys(),
            ...expensesByMonth.keys(),
            ...accruedByMonth.keys(),
            ...debitedByMonth.keys(),
        ]);

        const round2 = (v: number) => Number(v.toFixed(2));

        return {
            labels: keys.map(formatMonthLabel),
            revenue: keys.map((k) => round2(revenueByMonth.get(k) ?? 0)),
            expenses: keys.map((k) => round2(expensesByMonth.get(k) ?? 0)),
            accrued: keys.map((k) => round2(accruedByMonth.get(k) ?? 0)),
            debited: keys.map((k) => round2(debitedByMonth.get(k) ?? 0)),
        };
    }, [selectedRoom, incomes, expenses, sortedTx, objects]);

    const total = useMemo(() => {
        return sortedTx.reduce((s, e) => s + signedLineAmount(e), 0);
    }, [sortedTx]);

    const groupedTx = useMemo(() => {
        type Group = {
            key: string;
            objectId: number;
            objectName: string;
            roomName: string;
            rows: OwnerBalanceLedgerRow[];
            total: number;
        };
        const map = new Map<string, Group>();
        for (const tx of sortedTx) {
            const obj = objects.find((o) => o.id === tx.objectId || o.propertyId === tx.objectId);
            const objectName = obj?.name ?? `${tx.objectId}`;
            const roomName = (tx.roomName ?? '').trim() || '—';
            const key = `${obj?.id ?? tx.objectId}::${roomName}`;
            let group = map.get(key);
            if (!group) {
                group = {
                    key,
                    objectId: obj?.id ?? tx.objectId,
                    objectName,
                    roomName,
                    rows: [],
                    total: 0,
                };
                map.set(key, group);
            }
            group.rows.push(tx);
            group.total += signedLineAmount(tx);
        }
        return Array.from(map.values()).sort((a, b) => {
            const byObj = a.objectName.localeCompare(b.objectName, 'ru');
            if (byObj !== 0) return byObj;
            return a.roomName.localeCompare(b.roomName, 'ru');
        });
    }, [sortedTx, objects]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>
                {t('accountancy.cashflow.ownerDetailsTitle')}
                {owner ? `: ${owner.name}` : ''}
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={3}>
                    <Box>
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={2}
                            alignItems={{ xs: 'stretch', sm: 'center' }}
                            justifyContent="space-between"
                            sx={{ mb: 2 }}
                        >
                            <Typography variant="subtitle1">
                                {t('accountancy.cashflow.ownerRoomCharts')}
                            </Typography>
                            <ToggleButtonGroup
                                exclusive
                                size="small"
                                value={chartViewMode}
                                onChange={(_e, value: ChartViewMode | null) => {
                                    if (value != null) setChartViewMode(value);
                                }}
                                aria-label={t('accountancy.cashflow.chartViewMode')}
                            >
                                <ToggleButton value="line" aria-label={t('accountancy.cashflow.chartViewLine')}>
                                    <ShowChartIcon fontSize="small" sx={{ mr: 0.75 }} />
                                    {t('accountancy.cashflow.chartViewLine')}
                                </ToggleButton>
                                <ToggleButton
                                    value="columns"
                                    aria-label={t('accountancy.cashflow.chartViewColumns')}
                                >
                                    <BarChartIcon fontSize="small" sx={{ mr: 0.75 }} />
                                    {t('accountancy.cashflow.chartViewColumns')}
                                </ToggleButton>
                                <ToggleButton
                                    value="histogram"
                                    aria-label={t('accountancy.cashflow.chartViewHistogram')}
                                >
                                    <StackedBarChartIcon fontSize="small" sx={{ mr: 0.75 }} />
                                    {t('accountancy.cashflow.chartViewHistogram')}
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Stack>

                        {roomTabs.length === 0 ? (
                            <Paper variant="outlined" sx={{ p: 3 }}>
                                <Typography color="text.secondary">
                                    {t('accountancy.cashflow.noOwnerRooms')}
                                </Typography>
                            </Paper>
                        ) : (
                            <>
                                {roomTabs.length > 1 && (
                                    <Tabs
                                        value={selectedRoomKey}
                                        onChange={(_e, value: string) => setSelectedRoomKey(value)}
                                        variant="scrollable"
                                        scrollButtons="auto"
                                        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
                                    >
                                        {roomTabs.map((room) => (
                                            <Tab
                                                key={room.key}
                                                value={room.key}
                                                label={`${room.objectName} / ${room.roomName}`}
                                            />
                                        ))}
                                    </Tabs>
                                )}

                                {roomTabs.length === 1 && (
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        {roomTabs[0].objectName} / {roomTabs[0].roomName}
                                    </Typography>
                                )}

                                <Stack spacing={3}>
                                    <RoomMetricChart
                                        title={t('accountancy.cashflow.ownerRoomRevenueChart')}
                                        labels={roomChartData.labels}
                                        series={[
                                            {
                                                id: 'revenue',
                                                label: t('accountancy.cashflow.ownerRoomRevenue'),
                                                data: roomChartData.revenue,
                                            },
                                        ]}
                                        viewMode={chartViewMode}
                                        emptyLabel={t('accountancy.cashflow.noChartData')}
                                    />
                                    <RoomMetricChart
                                        title={t('accountancy.cashflow.ownerRoomExpensesChart')}
                                        labels={roomChartData.labels}
                                        series={[
                                            {
                                                id: 'expenses',
                                                label: t('accountancy.cashflow.ownerRoomExpenses'),
                                                data: roomChartData.expenses,
                                            },
                                        ]}
                                        viewMode={chartViewMode}
                                        emptyLabel={t('accountancy.cashflow.noChartData')}
                                    />
                                    <RoomMetricChart
                                        title={t('accountancy.cashflow.ownerRoomProfitabilityChart')}
                                        labels={roomChartData.labels}
                                        series={[
                                            {
                                                id: 'accrued',
                                                label: t('accountancy.cashflow.ownerRoomAccrued'),
                                                data: roomChartData.accrued,
                                                color: '#2e7d32',
                                            },
                                            {
                                                id: 'debited',
                                                label: t('accountancy.cashflow.ownerRoomDebited'),
                                                data: roomChartData.debited,
                                                color: '#d32f2f',
                                            },
                                        ]}
                                        viewMode={chartViewMode}
                                        emptyLabel={t('accountancy.cashflow.noChartData')}
                                    />
                                </Stack>
                            </>
                        )}
                    </Box>

                    <Box>
                        <Typography variant="subtitle1" sx={{ mb: 1 }}>
                            {t('accountancy.cashflow.transactionsList')} ({sortedTx.length})
                        </Typography>
                        {sortedTx.length === 0 ? (
                            <Paper variant="outlined" sx={{ p: 3 }}>
                                <Typography color="text.secondary">
                                    {t('accountancy.cashflow.noTransactions')}
                                </Typography>
                            </Paper>
                        ) : (
                            <Paper variant="outlined" sx={{ overflow: 'auto' }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>
                                                {t('accountancy.cashflow.transactionDate')}
                                            </TableCell>
                                            <TableCell>
                                                {t('accountancy.cashflow.transactionCategory')}
                                            </TableCell>
                                            <TableCell>
                                                {t('accountancy.cashflow.transactionReportMonth')}
                                            </TableCell>
                                            <TableCell>
                                                {t('accountancy.cashflow.transactionStatus')}
                                            </TableCell>
                                            <TableCell align="right">
                                                {t('accountancy.cashflow.transactionAmount')}
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {groupedTx.map((group) => (
                                            <Fragment key={group.key}>
                                                <TableRow
                                                    sx={{
                                                        backgroundColor: (theme) =>
                                                            theme.palette.action.hover,
                                                    }}
                                                >
                                                    <TableCell colSpan={5}>
                                                        <Typography
                                                            variant="body2"
                                                            fontWeight={600}
                                                        >
                                                            {group.objectName} / {group.roomName}
                                                            <Typography
                                                                component="span"
                                                                variant="body2"
                                                                color="text.secondary"
                                                                sx={{ ml: 1 }}
                                                            >
                                                                ({group.rows.length})
                                                            </Typography>
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                                {group.rows.map((e) => {
                                                    const amount = signedLineAmount(e);
                                                    return (
                                                        <TableRow
                                                            key={`${e.recordType}-${e._id}`}
                                                        >
                                                            <TableCell>
                                                                {formatDate(e.date)}
                                                            </TableCell>
                                                            <TableCell>{e.category}</TableCell>
                                                            <TableCell>
                                                                {e.reportMonth ?? '—'}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Chip
                                                                    size="small"
                                                                    variant="outlined"
                                                                    label={
                                                                        e.status === 'confirmed'
                                                                            ? t(
                                                                                  'accountancy.cashflow.statusConfirmed'
                                                                              )
                                                                            : t(
                                                                                  'accountancy.cashflow.statusDraft'
                                                                              )
                                                                    }
                                                                    color={
                                                                        e.status === 'confirmed'
                                                                            ? 'success'
                                                                            : 'default'
                                                                    }
                                                                />
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <SignedAmountText value={amount} />
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                                <TableRow>
                                                    <TableCell colSpan={4} align="right">
                                                        <Typography
                                                            variant="body2"
                                                            fontWeight={500}
                                                            color="text.secondary"
                                                        >
                                                            {t(
                                                                'accountancy.cashflow.groupSubtotal'
                                                            )}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <SignedAmountText
                                                            value={group.total}
                                                            fontWeight={500}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            </Fragment>
                                        ))}
                                        <TableRow>
                                            <TableCell colSpan={4} align="right">
                                                <Typography fontWeight={600}>
                                                    {t('accountancy.cashflow.balance')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <SignedAmountText value={total} fontWeight={600} />
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </Paper>
                        )}
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('common.close')}</Button>
            </DialogActions>
        </Dialog>
    );
}

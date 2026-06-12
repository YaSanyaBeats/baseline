'use client';

import { Fragment, useMemo } from 'react';
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
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { ownerBalanceSignedLineAmount } from '@/lib/ownerViewSettlements';
import type { User, Object as PropertyObject } from '@/lib/types';

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

interface OwnerBalanceDialogProps {
    open: boolean;
    onClose: () => void;
    owner: User | null;
    transactions: OwnerBalanceLedgerRow[];
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

function getMonthKey(d: Date | string): string {
    const date = new Date(d);
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${m}`;
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

export default function OwnerBalanceDialog({
    open,
    onClose,
    owner,
    transactions,
    objects,
    t,
}: OwnerBalanceDialogProps) {
    const sortedTx = useMemo(() => {
        return [...transactions].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
    }, [transactions]);

    const chartData = useMemo(() => {
        if (sortedTx.length === 0) return { labels: [] as string[], monthlyChange: [] as number[] };
        const monthMap = new Map<string, number>();
        for (const tx of sortedTx) {
            const monthKey = getMonthKey(tx.date);
            const amount = signedLineAmount(tx);
            monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + amount);
        }
        const sortedKeys = Array.from(monthMap.keys()).sort();
        const first = sortedKeys[0];
        const last = sortedKeys[sortedKeys.length - 1];
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

        const monthlyChange = keys.map((key) =>
            Number((monthMap.get(key) ?? 0).toFixed(2))
        );
        return {
            labels: keys.map(formatMonthLabel),
            monthlyChange,
        };
    }, [sortedTx]);

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
            const obj = objects.find((o) => o.id === tx.objectId);
            const objectName = obj?.name ?? `${tx.objectId}`;
            const roomName = (tx.roomName ?? '').trim() || '—';
            const key = `${tx.objectId}::${roomName}`;
            let group = map.get(key);
            if (!group) {
                group = {
                    key,
                    objectId: tx.objectId,
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
                                                        <SignedAmountText value={group.total} fontWeight={500} />
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

                    <Box>
                        <Typography variant="subtitle1" sx={{ mb: 1 }}>
                            {t('accountancy.cashflow.ownerMonthlyChart')}
                        </Typography>
                        {chartData.labels.length > 0 ? (
                            <Box sx={{ width: '100%', overflow: 'auto' }}>
                                <BarChart
                                    xAxis={[
                                        {
                                            data: chartData.labels,
                                            scaleType: 'band',
                                        },
                                    ]}
                                    series={[
                                        {
                                            data: chartData.monthlyChange,
                                            label: t('accountancy.cashflow.ownerMonthlyGrowth'),
                                            valueFormatter: (v) =>
                                                v == null ? '' : formatAmount(v as number),
                                        },
                                    ]}
                                    height={320}
                                    margin={{ left: 80, right: 30, top: 30, bottom: 50 }}
                                />
                            </Box>
                        ) : (
                            <Paper variant="outlined" sx={{ p: 3 }}>
                                <Typography color="text.secondary">
                                    {t('accountancy.cashflow.noTransactions')}
                                </Typography>
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

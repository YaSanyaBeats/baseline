'use client'

import { useEffect, useMemo, useState } from "react";
import {
    Box,
    Button,
    Typography,
    Alert,
    Stack,
    Paper,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
} from "@mui/material";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import Link from 'next/link';
import { useObjects } from "@/providers/ObjectsProvider";
import { Expense, Income } from "@/lib/types";
import { getExpenses } from "@/lib/expenses";
import { getIncomes } from "@/lib/incomes";
import { getBookingsByIds } from "@/lib/bookings";

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedObjectId, setSelectedObjectId] = useState<number | 'all'>('all');
    const [selectedRoomId, setSelectedRoomId] = useState<number | 'all'>('all');
    const [roomStats, setRoomStats] = useState<Record<string, { expenses: number; incomes: number }>>({});
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');

    const { hasAccess } = useMemo(() => {
        const hasAccess = isAdmin || isAccountant;
        return { hasAccess };
    }, [isAdmin, isAccountant]);

    useEffect(() => {
        if (!hasAccess) return;

        const load = async () => {
            try {
                const [exp, inc] = await Promise.all([getExpenses(), getIncomes()]);
                setExpenses(exp);
                setIncomes(inc);

                const bookingIds = Array.from(
                    new Set(
                        [
                            ...exp.map((e) => e.bookingId).filter((id): id is number => typeof id === 'number'),
                            ...inc.map((i) => i.bookingId).filter((id): id is number => typeof id === 'number'),
                        ],
                    ),
                );

                if (bookingIds.length) {
                    const bookings = await getBookingsByIds(bookingIds);
                    const stats: Record<string, { expenses: number; incomes: number }> = {};

                    bookings.forEach((booking) => {
                        const key = `${booking.propertyId ?? ''}-${booking.unitId ?? ''}`;
                        if (!stats[key]) {
                            stats[key] = { expenses: 0, incomes: 0 };
                        }
                    });

                    exp.forEach((e) => {
                        if (!e.bookingId) return;
                        const booking = bookings.find((b) => b.id === e.bookingId);
                        if (!booking) return;
                        const key = `${booking.propertyId ?? ''}-${booking.unitId ?? ''}`;
                        if (!stats[key]) {
                            stats[key] = { expenses: 0, incomes: 0 };
                        }
                        stats[key].expenses += e.amount;
                    });

                    inc.forEach((i) => {
                        if (!i.bookingId) return;
                        const booking = bookings.find((b) => b.id === i.bookingId);
                        if (!booking) return;
                        const key = `${booking.propertyId ?? ''}-${booking.unitId ?? ''}`;
                        if (!stats[key]) {
                            stats[key] = { expenses: 0, incomes: 0 };
                        }
                        stats[key].incomes += i.amount;
                    });

                    setRoomStats(stats);
                }
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [hasAccess]);

    

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalIncomes = incomes.reduce((sum, i) => sum + i.amount, 0);
    const balance = totalIncomes - totalExpenses;

    const filteredByDate = useMemo(() => {
        const isInRange = (d: Date | string | undefined) => {
            if (!d) return true;
            if (!dateFrom && !dateTo) return true;
            const date = new Date(d as any);
            if (dateFrom) {
                const from = new Date(dateFrom);
                if (date < from) return false;
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setDate(to.getDate() + 1);
                if (date >= to) return false;
            }
            return true;
        };

        return {
            expenses: expenses.filter((e) => isInRange(e.date)),
            incomes: incomes.filter((i) => isInRange(i.date)),
        };
    }, [expenses, incomes, dateFrom, dateTo]);

    const objectStats = useMemo(() => {
        const map: Record<number, { expenses: number; incomes: number }> = {};
        filteredByDate.expenses.forEach((e) => {
            if (!map[e.objectId]) map[e.objectId] = { expenses: 0, incomes: 0 };
            map[e.objectId].expenses += e.amount;
        });
        filteredByDate.incomes.forEach((i) => {
            if (!map[i.objectId]) map[i.objectId] = { expenses: 0, incomes: 0 };
            map[i.objectId].incomes += i.amount;
        });
        return map;
    }, [filteredByDate]);

    const selectedObject = selectedObjectId === 'all'
        ? null
        : objects.find((o) => o.id === selectedObjectId);

    const roomsForSelectedObject = useMemo(
        () => (selectedObject ? selectedObject.roomTypes : []),
        [selectedObject],
    );

    const filteredRoomStats = useMemo(() => {
        if (!selectedObject) return [];

        return roomsForSelectedObject
            .map((room) => {
                const key = `${selectedObject.id}-${room.id}`;
                const stat = roomStats[key] || { expenses: 0, incomes: 0 };
                return {
                    roomId: room.id,
                    roomName: room.name || `Room ${room.id}`,
                    ...stat,
                };
            })
            .filter((row) =>
                selectedRoomId === 'all' ? true : row.roomId === selectedRoomId,
            );
    }, [selectedObject, roomsForSelectedObject, roomStats, selectedRoomId]);

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
        <Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('menu.accountancy')}
            </Typography>

            

            <Stack spacing={2} direction={'row'} mb={3}>
                <Link href="/dashboard/accountancy/expense">
                    <Button
                        fullWidth
                        variant="contained"
                    >
                        Расходы
                    </Button>
                </Link>

                <Link href="/dashboard/accountancy/income">
                    <Button
                        fullWidth
                        variant="contained"
                    >
                        Приходы
                    </Button>
                </Link>

                <Link href="/dashboard/accountancy/reports">
                    <Button
                        fullWidth
                        variant="contained"
                    >
                        Отчёты
                    </Button>
                </Link>

                <Link href="/dashboard/accountancy/categories">
                    <Button
                        fullWidth
                        variant="outlined"
                    >
                        {t('accountancy.categoriesTitle')}
                    </Button>
                </Link>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                        {t('accountancy.totalExpenses')}
                    </Typography>
                    <Typography variant="h6" color="error">
                        {-totalExpenses}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                        {t('accountancy.totalIncomes')}
                    </Typography>
                    <Typography variant="h6" color="success.main">
                        {totalIncomes}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                        {t('accountancy.balance')}
                    </Typography>
                    <Typography variant="h6" color={balance >= 0 ? 'success.main' : 'error'}>
                        {balance}
                    </Typography>
                </Paper>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mb: 3 }}>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        {t('accountancy.statsByObject')}
                    </Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
                        <TextField
                            type="date"
                            label={t('analytics.from')}
                            InputLabelProps={{ shrink: true }}
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            sx={{ maxWidth: 200 }}
                        />
                        <TextField
                            type="date"
                            label={t('analytics.to')}
                            InputLabelProps={{ shrink: true }}
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            sx={{ maxWidth: 200 }}
                        />
                    </Stack>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('common.object')}</TableCell>
                                <TableCell>{t('accountancy.amountColumn')} ({t('accountancy.expensesTitle')})</TableCell>
                                <TableCell>{t('accountancy.amountColumn')} ({t('accountancy.incomesTitle')})</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {objects.map((obj) => {
                                const stat = objectStats[obj.id] || { expenses: 0, incomes: 0 };
                                return (
                                    <TableRow key={obj.id}>
                                        <TableCell>{obj.name}</TableCell>
                                        <TableCell>{stat.expenses}</TableCell>
                                        <TableCell>{stat.incomes}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Paper>

                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        {t('accountancy.statsByRoom')}
                    </Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
                        <FormControl sx={{ minWidth: 180 }}>
                            <InputLabel>{t('common.object')}</InputLabel>
                            <Select
                                label={t('common.object')}
                                value={selectedObjectId === 'all' ? '' : String(selectedObjectId)}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setSelectedObjectId(value ? Number(value) : 'all');
                                    setSelectedRoomId('all');
                                }}
                            >
                                <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                {objects.map((obj) => (
                                    <MenuItem key={obj.id} value={String(obj.id)}>
                                        {obj.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {selectedObject && (
                            <FormControl sx={{ minWidth: 180 }}>
                                <InputLabel>{t('common.room')}</InputLabel>
                                <Select
                                    label={t('common.room')}
                                    value={selectedRoomId === 'all' ? '' : String(selectedRoomId)}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setSelectedRoomId(value ? Number(value) : 'all');
                                    }}
                                >
                                    <MenuItem value="">{t('accountancy.all')}</MenuItem>
                                    {roomsForSelectedObject.map((room) => (
                                        <MenuItem key={room.id} value={String(room.id)}>
                                            {room.name || `Room ${room.id}`}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    </Stack>

                    {loading ? (
                        <Typography>{t('accountancy.loading')}</Typography>
                    ) : !selectedObject || filteredRoomStats.length === 0 ? (
                        <Typography color="text.secondary">
                            {t('accountancy.noStatsForSelection')}
                        </Typography>
                    ) : (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('common.room')}</TableCell>
                                    <TableCell>{t('accountancy.amountColumn')} ({t('accountancy.expensesTitle')})</TableCell>
                                    <TableCell>{t('accountancy.amountColumn')} ({t('accountancy.incomesTitle')})</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredRoomStats.map((row) => (
                                    <TableRow key={row.roomId}>
                                        <TableCell>{row.roomName}</TableCell>
                                        <TableCell>{row.expenses}</TableCell>
                                        <TableCell>{row.incomes}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </Paper>
            </Stack>
        </Box>
    );
}


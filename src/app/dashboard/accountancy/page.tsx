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
import { useTheme } from "@mui/material/styles";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import Link from 'next/link';
import { useObjects } from "@/providers/ObjectsProvider";
import { Booking, Expense, Income } from "@/lib/types";
import { getExpenses } from "@/lib/expenses";
import { getIncomes } from "@/lib/incomes";
import { getBookingsByIds } from "@/lib/bookings";

const NO_ROOM_ID = -1;

export default function Page() {
    const { t } = useTranslation();
    const theme = useTheme();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();

    // Функция для форматирования чисел с двумя знаками после запятой и разделителями разрядов
    const formatAmount = (value: number): string => {
        return value.toLocaleString('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedObjectId, setSelectedObjectId] = useState<number | 'all'>('all');
    const [selectedRoomId, setSelectedRoomId] = useState<number | 'all'>('all');
    const [roomStats, setRoomStats] = useState<Record<string, { expenses: number; incomes: number }>>({});
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    // '' = кастомный период по dateFrom/dateTo; 'YYYY-MM' = выбранный месяц
    const [selectedMonth, setSelectedMonth] = useState<string>('');

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

                const stats: Record<string, { expenses: number; incomes: number }> = {};

                if (bookingIds.length) {
                    const bookingsList = await getBookingsByIds(bookingIds);
                    setBookings(bookingsList);
                    const bookings = bookingsList;

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
                } else {
                    setBookings([]);
                }

                // Расходы и доходы с прямой привязкой к комнате (roomId) или без привязки
                exp.forEach((e) => {
                    if (e.bookingId) return;
                    if (e.roomId) {
                        const key = `${e.objectId}-${e.roomId}`;
                        if (!stats[key]) stats[key] = { expenses: 0, incomes: 0 };
                        stats[key].expenses += e.amount;
                    } else {
                        const key = `${e.objectId}-no-room`;
                        if (!stats[key]) stats[key] = { expenses: 0, incomes: 0 };
                        stats[key].expenses += e.amount;
                    }
                });
                inc.forEach((i) => {
                    if (i.bookingId) return;
                    if (i.roomId) {
                        const key = `${i.objectId}-${i.roomId}`;
                        if (!stats[key]) stats[key] = { expenses: 0, incomes: 0 };
                        stats[key].incomes += i.amount;
                    } else {
                        const key = `${i.objectId}-no-room`;
                        if (!stats[key]) stats[key] = { expenses: 0, incomes: 0 };
                        stats[key].incomes += i.amount;
                    }
                });

                setRoomStats(stats);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [hasAccess]);

    

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalIncomes = incomes.reduce((sum, i) => sum + i.amount, 0);
    const balance = totalIncomes - totalExpenses;

    // Формат YYYY-MM-DD в локальной таймзоне (без сдвига UTC)
    const toLocalDateString = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Эффективный период: либо выбранный месяц, либо кастомные dateFrom/dateTo
    const effectiveDateRange = useMemo(() => {
        if (selectedMonth) {
            const [y, m] = selectedMonth.split('-').map(Number);
            const from = new Date(y, m - 1, 1);       // 1-е число месяца
            const to = new Date(y, m, 0);             // последний день месяца
            return {
                from: toLocalDateString(from),
                to: toLocalDateString(to),
            };
        }
        return { from: dateFrom, to: dateTo };
    }, [selectedMonth, dateFrom, dateTo]);

    const filteredByDate = useMemo(() => {
        const { from: effFrom, to: effTo } = effectiveDateRange;
        const isInRange = (d: Date | string | undefined) => {
            if (!d) return true;
            if (!effFrom && !effTo) return true;
            const date = new Date(d as any);
            if (effFrom) {
                const from = new Date(effFrom);
                if (date < from) return false;
            }
            if (effTo) {
                const to = new Date(effTo);
                to.setDate(to.getDate() + 1);
                if (date >= to) return false;
            }
            return true;
        };

        return {
            expenses: expenses.filter((e) => isInRange(e.date)),
            incomes: incomes.filter((i) => isInRange(i.date)),
        };
    }, [expenses, incomes, effectiveDateRange]);

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

        const roomRows = roomsForSelectedObject.map((room) => {
            const key = `${selectedObject.id}-${room.id}`;
            const stat = roomStats[key] || { expenses: 0, incomes: 0 };
            return {
                roomId: room.id,
                roomName: room.name || `Room ${room.id}`,
                ...stat,
            };
        });

        const noRoomKey = `${selectedObject.id}-no-room`;
        const noRoomStat = roomStats[noRoomKey] || { expenses: 0, incomes: 0 };
        const noRoomRow = {
            roomId: NO_ROOM_ID,
            roomName: '', // подставим перевод в рендере
            expenses: noRoomStat.expenses,
            incomes: noRoomStat.incomes,
        };

        const allRows = [...roomRows, noRoomRow];
        return selectedRoomId === 'all'
            ? allRows
            : allRows.filter((row) => row.roomId === selectedRoomId);
    }, [selectedObject, roomsForSelectedObject, roomStats, selectedRoomId]);

    type OperationRow = {
        id: string;
        type: 'expense' | 'income';
        status: 'draft' | 'confirmed';
        date: Date | string;
        commentShort: string;
        amount: number;
        createdBy: string;
        lastEdit: string;
    };

    const filteredOperations = useMemo((): OperationRow[] => {
        if (selectedObjectId === 'all' || !selectedObject) return [];

        const matchRoom = (roomId?: number, bookingId?: number) => {
            if (selectedRoomId === 'all') return true;
            if (selectedRoomId === NO_ROOM_ID) return !roomId && !bookingId;
            // Прямая привязка к комнате
            if (roomId === selectedRoomId) return true;
            // Привязка через бронирование
            if (!bookingId) return false;
            const booking = bookings.find((b) => b.id === bookingId);
            if (!booking) return false;
            return (
                (booking.propertyId ?? null) === selectedObjectId &&
                (booking.unitId ?? null) === selectedRoomId
            );
        };

        const shortComment = (s: string | undefined, maxLen = 40) =>
            !s ? '—' : s.length <= maxLen ? s : s.slice(0, maxLen) + '…';

        const rows: OperationRow[] = [];

        expenses
            .filter((e) => e.objectId === selectedObjectId && matchRoom(e.roomId, e.bookingId))
            .forEach((e) => {
                rows.push({
                    id: `exp-${e._id ?? ''}`,
                    type: 'expense',
                    status: e.status,
                    date: e.date,
                    commentShort: shortComment(e.comment),
                    amount: -e.amount,
                    createdBy: e.accountantName ?? '—',
                    lastEdit: '—',
                });
            });

        incomes
            .filter((i) => i.objectId === selectedObjectId && matchRoom(i.roomId, i.bookingId))
            .forEach((i) => {
                rows.push({
                    id: `inc-${i._id ?? ''}`,
                    type: 'income',
                    status: 'confirmed',
                    date: i.date,
                    commentShort: shortComment(i.category),
                    amount: i.amount,
                    createdBy: i.accountantName ?? '—',
                    lastEdit: '—',
                });
            });

        rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return rows;
    }, [
        selectedObjectId,
        selectedObject,
        selectedRoomId,
        expenses,
        incomes,
        bookings,
    ]);

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

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mb: 3 }}>
                <Paper sx={{ p: 2, flexBasis: '33%' }}>
                    <Typography variant="subtitle2" color="text.secondary">
                        {t('accountancy.totalExpenses')}
                    </Typography>
                    <Typography variant="h6" color="error">
                        {formatAmount(-totalExpenses)}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flexBasis: '33%' }}>
                    <Typography variant="subtitle2" color="text.secondary">
                        {t('accountancy.totalIncomes')}
                    </Typography>
                    <Typography variant="h6" color="success.main">
                        {formatAmount(totalIncomes)}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2, flexBasis: '33%' }}>
                    <Typography variant="subtitle2" color="text.secondary">
                        {t('accountancy.balance')}
                    </Typography>
                    <Typography variant="h6" color={balance >= 0 ? 'success.main' : 'error'}>
                        {formatAmount(balance)}
                    </Typography>
                </Paper>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mb: 3 }}>
                <Paper sx={{ p: 2, flex: 1  }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        {t('accountancy.statsByObject')}
                    </Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                        <FormControl sx={{ minWidth: 200 }} size="small">
                            <InputLabel>{t('accountancy.selectMonth')}</InputLabel>
                            <Select
                                label={t('accountancy.selectMonth')}
                                value={selectedMonth}
                                onChange={(e) => {
                                    const value = e.target.value as string;
                                    setSelectedMonth(value);
                                    if (value) {
                                        const [y, m] = value.split('-').map(Number);
                                        const from = new Date(y, m - 1, 1);
                                        const to = new Date(y, m, 0);
                                        setDateFrom(toLocalDateString(from));
                                        setDateTo(toLocalDateString(to));
                                    }
                                }}
                            >
                                <MenuItem value="">
                                    <em>{t('analytics.customPeriod')}</em>
                                </MenuItem>
                                {(() => {
                                    const options: { value: string; label: string }[] = [];
                                    const now = new Date();
                                    for (let i = 0; i < 24; i++) {
                                        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                                        const y = d.getFullYear();
                                        const m = d.getMonth() + 1;
                                        const value = `${y}-${String(m).padStart(2, '0')}`;
                                        const monthName = t(`accountancy.months.${m}`);
                                        options.push({ value, label: `${monthName} ${y}` });
                                    }
                                    return options.map((o) => (
                                        <MenuItem key={o.value} value={o.value}>
                                            {o.label}
                                        </MenuItem>
                                    ));
                                })()}
                            </Select>
                        </FormControl>
                        <TextField
                            type="date"
                            label={t('analytics.from')}
                            InputLabelProps={{ shrink: true }}
                            value={dateFrom}
                            onChange={(e) => {
                                setDateFrom(e.target.value);
                                setSelectedMonth('');
                            }}
                            size="small"
                            sx={{ maxWidth: 200 }}
                        />
                        <TextField
                            type="date"
                            label={t('analytics.to')}
                            InputLabelProps={{ shrink: true }}
                            value={dateTo}
                            onChange={(e) => {
                                setDateTo(e.target.value);
                                setSelectedMonth('');
                            }}
                            size="small"
                            sx={{ maxWidth: 200 }}
                        />
                    </Stack>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('common.object')}</TableCell>
                                <TableCell>{t('accountancy.incomesTitle')}</TableCell>
                                <TableCell>{t('accountancy.expensesTitle')}</TableCell>
                                <TableCell>{t('accountancy.balance')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {objects.map((obj) => {
                                const stat = objectStats[obj.id] || { expenses: 0, incomes: 0 };
                                const rowBalance = stat.incomes - stat.expenses;
                                return (
                                    <TableRow key={obj.id}>
                                        <TableCell>{obj.name}</TableCell>
                                        <TableCell>{formatAmount(stat.incomes)}</TableCell>
                                        <TableCell>{formatAmount(stat.expenses)}</TableCell>
                                        <TableCell sx={{ color: rowBalance >= 0 ? 'success.main' : 'error.main' }}>
                                            {formatAmount(rowBalance)}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Paper>

                <Paper sx={{ p: 2, flex: 2 }}>
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
                                    <MenuItem value={String(NO_ROOM_ID)}>{t('accountancy.noRoom')}</MenuItem>
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
                        <>
                            {selectedObject && (() => {
                                const totalObjectExpenses = filteredRoomStats.reduce((s, r) => s + r.expenses, 0);
                                const totalObjectIncomes = filteredRoomStats.reduce((s, r) => s + r.incomes, 0);
                                const balanceObject = totalObjectIncomes - totalObjectExpenses;
                                return (
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                                        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 0 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                {t('accountancy.totalExpenses')} ({selectedObject.name})
                                            </Typography>
                                            <Typography variant="subtitle1" color="error.main">
                                                {formatAmount(totalObjectExpenses)}
                                            </Typography>
                                        </Paper>
                                        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 0 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                {t('accountancy.totalIncomes')} ({selectedObject.name})
                                            </Typography>
                                            <Typography variant="subtitle1" color="success.main">
                                                {formatAmount(totalObjectIncomes)}
                                            </Typography>
                                        </Paper>
                                        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 0 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                {t('accountancy.balance')} ({selectedObject.name})
                                            </Typography>
                                            <Typography variant="subtitle1" color={balanceObject >= 0 ? 'success.main' : 'error.main'}>
                                                {formatAmount(balanceObject)}
                                            </Typography>
                                        </Paper>
                                    </Stack>
                                );
                            })()}
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
                                        <TableRow key={row.roomId === NO_ROOM_ID ? 'no-room' : row.roomId}>
                                            <TableCell>{row.roomId === NO_ROOM_ID ? t('accountancy.noRoom') : row.roomName}</TableCell>
                                            <TableCell>{formatAmount(row.expenses)}</TableCell>
                                            <TableCell>{formatAmount(row.incomes)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            {selectedObject && (
                                <>
                                    <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
                                        {t('accountancy.operationsList')}
                                    </Typography>
                                    {filteredOperations.length === 0 ? (
                                        <Typography color="text.secondary">
                                            {t('accountancy.noOperations')}
                                        </Typography>
                                    ) : (
                                        <Table size="small" sx={{ mt: 1 }}>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>{t('common.status')}</TableCell>
                                                    <TableCell>{t('accountancy.dateColumn')}</TableCell>
                                                    <TableCell>{t('accountancy.typeColumn')}</TableCell>
                                                    <TableCell>{t('accountancy.comment')}</TableCell>
                                                    <TableCell>{t('accountancy.amount')}</TableCell>
                                                    <TableCell>{t('accountancy.createdBy')}</TableCell>
                                                    <TableCell>{t('accountancy.lastEdit')}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {filteredOperations.map((row) => (
                                                    <TableRow key={row.id}>
                                                        <TableCell>
                                                            <Box
                                                                sx={{
                                                                    width: 10,
                                                                    height: 10,
                                                                    borderRadius: '50%',
                                                                    bgcolor: row.status === 'draft'
                                                                        ? theme.palette.error.main
                                                                        : theme.palette.success.main,
                                                                }}
                                                                title={row.status === 'draft' ? t('accountancy.statusDraft') : t('accountancy.statusConfirmed')}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            {row.date
                                                                ? new Date(row.date).toLocaleDateString('ru-RU', {
                                                                      day: '2-digit',
                                                                      month: '2-digit',
                                                                      year: 'numeric',
                                                                  })
                                                                : '—'}
                                                        </TableCell>
                                                        <TableCell>
                                                            {row.type === 'expense' ? t('accountancy.expensesTitle') : t('accountancy.incomesTitle')}
                                                        </TableCell>
                                                        <TableCell>{row.commentShort}</TableCell>
                                                        <TableCell sx={{ color: row.amount >= 0 ? 'success.main' : 'error.main' }}>
                                                            {row.amount >= 0 ? '+' : ''}{formatAmount(row.amount)}
                                                        </TableCell>
                                                        <TableCell>{row.createdBy}</TableCell>
                                                        <TableCell>{row.lastEdit}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </Paper>
            </Stack>
        </Box>
    );
}


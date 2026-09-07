'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
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
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { OccupancyBar } from '@/components/pricing/OccupancyBar';
import { usePricingNotify } from '@/components/pricing/usePricingNotify';
import { useTranslation } from '@/i18n/useTranslation';
import { PERIOD_IDS, availableSeasonYears, defaultPeriodForToday, formatPeriodRange, resolvePeriodWindow, seasonYearForDate, type PeriodId, type SeasonRegime } from '@/lib/pricing/periods';
import { acceptRecommendation, clearOverride, fetchPricingDesk, saveOverride } from '@/lib/pricing/client';
import type { DeskClusterRow, DeskPayload, DeskRoomRow } from '@/lib/pricing/types';

function regimeColor(regime: SeasonRegime): 'error' | 'warning' | 'info' {
    if (regime === 'HIGH') return 'error';
    if (regime === 'SHOULDER') return 'warning';
    return 'info';
}

function actionColor(action: string) {
    if (action === 'raise') return 'success.main';
    if (action === 'cut') return 'error.main';
    return 'text.secondary';
}

function formatBaht(n: number | null | undefined) {
    if (n == null || Number.isNaN(n)) return '—';
    return `${Math.round(n).toLocaleString('ru-RU')} ฿`;
}

function regimeLabel(t: (key: string) => string, regime: SeasonRegime) {
    return t(`pricing.regimeLabels.${regime}`);
}

function actionText(t: (key: string) => string, action: string, lt?: boolean) {
    if (lt) return t('pricing.actions.lt');
    return t(`pricing.actions.${action}`);
}

export default function PricingDeskPage() {
    const { t } = useTranslation();
    const notify = usePricingNotify();
    const [period, setPeriod] = useState<PeriodId>(defaultPeriodForToday());
    const [year, setYear] = useState(() => seasonYearForDate());
    const [days, setDays] = useState(45);
    const [useComp, setUseComp] = useState(true);
    const [loading, setLoading] = useState(true);
    const [desk, setDesk] = useState<DeskPayload | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [accept, setAccept] = useState<{ cluster?: string; room?: DeskRoomRow; price: number; reason: string } | null>(null);
    const [detail, setDetail] = useState<{ cluster: DeskClusterRow; room: DeskRoomRow } | null>(null);
    const [overrideValue, setOverrideValue] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchPricingDesk(period, days, useComp, year);
            setDesk(data);
            setDays(data.daysToArrival);
        } catch {
            notify(t('pricing.loadError'), 'error');
        } finally {
            setLoading(false);
        }
    }, [period, year, days, useComp, notify, t]);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, year, useComp]);

    const handleAccept = async () => {
        if (!accept || !desk) return;
        setBusy(true);
        try {
            const res = await acceptRecommendation({
                roomId: accept.room?.roomId ?? null,
                cluster: accept.cluster ?? null,
                period: desk.period,
                year: desk.year,
                price: accept.price,
                reason: accept.reason,
            });
            notify(res.message || t('pricing.acceptedLocal'), 'success');
            setAccept(null);
            await load();
        } catch {
            notify(t('pricing.saveError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleOverride = async () => {
        if (!detail || !desk) return;
        const price = Number(overrideValue);
        setBusy(true);
        try {
            if (!price) {
                await clearOverride(detail.room.roomId, desk.period, desk.year);
            } else {
                await saveOverride(detail.room.roomId, desk.period, price, desk.year);
            }
            notify(t('common.save'), 'success');
            setDetail(null);
            await load();
        } catch {
            notify(t('pricing.saveError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Stack spacing={2}>
            <Paper sx={{ p: 2 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                    <FormControl size="small" sx={{ minWidth: 110 }}>
                        <InputLabel>{t('pricing.year')}</InputLabel>
                        <Select
                            label={t('pricing.year')}
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                        >
                            {availableSeasonYears().map((y) => (
                                <MenuItem key={y} value={y}>
                                    {y}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 240 }}>
                        <InputLabel>{t('pricing.period')}</InputLabel>
                        <Select
                            label={t('pricing.period')}
                            value={period}
                            onChange={(e) => setPeriod(e.target.value as PeriodId)}
                        >
                            {PERIOD_IDS.map((id) => {
                                const w = resolvePeriodWindow(id, year);
                                return (
                                    <MenuItem key={id} value={id}>
                                        {formatPeriodRange(w.start, w.end)}
                                    </MenuItem>
                                );
                            })}
                        </Select>
                    </FormControl>
                    <TextField
                        size="small"
                        type="number"
                        label={t('pricing.daysToArrival')}
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        onBlur={() => void load()}
                        sx={{ width: 140 }}
                    />
                    <FormControlLabel
                        control={<Checkbox checked={useComp} onChange={(e) => setUseComp(e.target.checked)} />}
                        label={t('pricing.useCompetitors')}
                    />
                    <Button variant="outlined" onClick={() => void load()} disabled={loading}>
                        {t('pricing.refresh')}
                    </Button>
                </Stack>
                {desk && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                        {t('pricing.snapshot')}: {desk.periodLabel} · {t('pricing.companyOtb')}{' '}
                        <b>{Math.round(desk.companyOtbPct)}%</b>
                    </Typography>
                )}
            </Paper>

            {loading && !desk ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell />
                                <TableCell>{t('pricing.clusterObject')}</TableCell>
                                <TableCell>{t('pricing.regime')}</TableCell>
                                <TableCell>{t('pricing.rpi')}</TableCell>
                                <TableCell>{t('pricing.currentPrice')}</TableCell>
                                <TableCell>{t('pricing.otb')}</TableCell>
                                <TableCell>{t('pricing.compSet')}</TableCell>
                                <TableCell>{t('pricing.recAdr')}</TableCell>
                                <TableCell>{t('pricing.deltaComp')}</TableCell>
                                <TableCell>{t('pricing.action')}</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {(desk?.clusters || []).map((cluster) => (
                                <Fragment key={cluster.cluster}>
                                    <TableRow key={cluster.cluster} hover sx={{ cursor: 'pointer' }} onClick={() => setExpanded((s) => ({ ...s, [cluster.cluster]: !s[cluster.cluster] }))}>
                                        <TableCell width={36}>
                                            <IconButton size="small">
                                                {expanded[cluster.cluster] ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                            </IconButton>
                                        </TableCell>
                                        <TableCell>
                                            <b>{cluster.cluster}</b>{' '}
                                            <Typography component="span" variant="caption" color="text.secondary">
                                                ({cluster.units} {t('pricing.units')})
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip size="small" color={regimeColor(cluster.regime)} label={regimeLabel(t, cluster.regime)} />
                                        </TableCell>
                                        <TableCell>{cluster.recommendation.rpi.toFixed(2)}</TableCell>
                                        <TableCell>{formatBaht(cluster.currentPrice)}</TableCell>
                                        <TableCell>
                                            <OccupancyBar value={cluster.occupancy.otbPct} />
                                        </TableCell>
                                        <TableCell>{formatBaht(cluster.recommendation.competitor)}</TableCell>
                                        <TableCell>
                                            <b>{formatBaht(cluster.recommendation.target)}</b>
                                        </TableCell>
                                        <TableCell sx={{ color: (cluster.recommendation.deltaToCompPct ?? 0) >= 0 ? 'success.main' : 'error.main' }}>
                                            {cluster.recommendation.deltaToCompPct == null
                                                ? '—'
                                                : `${cluster.recommendation.deltaToCompPct >= 0 ? '+' : ''}${cluster.recommendation.deltaToCompPct.toFixed(0)}%`}
                                        </TableCell>
                                        <TableCell sx={{ color: actionColor(cluster.recommendation.action), fontWeight: 700 }}>
                                            {actionText(t, cluster.recommendation.action)}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                size="small"
                                                variant="contained"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAccept({
                                                        cluster: cluster.cluster,
                                                        price: cluster.recommendation.target,
                                                        reason: cluster.recommendation.reason,
                                                    });
                                                }}
                                            >
                                                {t('pricing.accept')}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                    {expanded[cluster.cluster] &&
                                        cluster.rooms.map((room, roomIdx) => {
                                            const price = room.override ?? room.recommendation.target;
                                            return (
                                                <TableRow key={`${cluster.cluster}-${room.roomId}-${roomIdx}`} sx={{ bgcolor: 'action.hover' }}>
                                                    <TableCell />
                                                    <TableCell
                                                        sx={{ pl: 6, cursor: 'pointer' }}
                                                        onClick={() => {
                                                            setDetail({ cluster, room });
                                                            setOverrideValue(room.override ? String(room.override) : '');
                                                        }}
                                                    >
                                                        {room.name}{' '}
                                                        <Typography component="span" variant="caption" color="text.secondary">
                                                            #{room.roomId}
                                                        </Typography>
                                                        {room.flags.includes('low') && <Chip sx={{ ml: 0.5 }} size="small" color="error" label={t('pricing.flags.low')} />}
                                                        {room.flags.includes('hot') && <Chip sx={{ ml: 0.5 }} size="small" color="success" label={t('pricing.flags.hot')} />}
                                                        {room.flags.includes('nocs') && <Chip sx={{ ml: 0.5 }} size="small" color="warning" label={t('pricing.flags.nocs')} />}
                                                        {room.flags.includes('lt') && <Chip sx={{ ml: 0.5 }} size="small" label={t('pricing.flags.lt')} />}
                                                        {room.flags.includes('override') && <Chip sx={{ ml: 0.5 }} size="small" color="secondary" label={t('pricing.flags.override')} />}
                                                        {room.flags.includes('new') && <Chip sx={{ ml: 0.5 }} size="small" label={t('pricing.flags.new')} />}
                                                    </TableCell>
                                                    <TableCell />
                                                    <TableCell />
                                                    <TableCell>{formatBaht(room.currentPrice)}</TableCell>
                                                    <TableCell>
                                                        <OccupancyBar value={room.occupancy.otbPct} />
                                                    </TableCell>
                                                    <TableCell>
                                                        {formatBaht(room.recommendation.competitor)}
                                                        <Typography variant="caption" display="block" color="text.secondary">
                                                            {t(`pricing.anchor.${room.anchorMode}`)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <b>{formatBaht(price)}</b>
                                                    </TableCell>
                                                    <TableCell>
                                                        {room.recommendation.deltaToCompPct == null
                                                            ? '—'
                                                            : `${room.recommendation.deltaToCompPct >= 0 ? '+' : ''}${room.recommendation.deltaToCompPct.toFixed(0)}%`}
                                                    </TableCell>
                                                    <TableCell sx={{ color: actionColor(room.recommendation.action), fontWeight: 600 }}>
                                                        {actionText(t, room.recommendation.action, room.occupancy.lt)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button
                                                            size="small"
                                                            disabled={room.occupancy.lt}
                                                            onClick={() =>
                                                                setAccept({
                                                                    room,
                                                                    price,
                                                                    reason: room.recommendation.reason,
                                                                })
                                                            }
                                                        >
                                                            {t('pricing.accept')}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                </Fragment>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Dialog open={Boolean(accept)} onClose={() => setAccept(null)} maxWidth="sm" fullWidth>
                <DialogTitle>{t('pricing.acceptTitle')}</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        {t('pricing.acceptNoBeds24')}
                    </Alert>
                    <Typography variant="h6">{formatBaht(accept?.price)}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {accept?.reason}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAccept(null)}>{t('common.cancel')}</Button>
                    <Button variant="contained" disabled={busy} onClick={() => void handleAccept()}>
                        {t('pricing.acceptConfirm')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
                <DialogTitle>
                    {detail?.room.name} · #{detail?.room.roomId}
                </DialogTitle>
                <DialogContent>
                    {detail && (
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                                <Chip label={`${t('pricing.otb')} ${Math.round(detail.room.occupancy.otbPct)}%`} />
                                <Chip label={regimeLabel(t, detail.cluster.regime)} color={regimeColor(detail.cluster.regime)} />
                                <Chip label={`${t('pricing.currentPrice')} ${formatBaht(detail.room.currentPrice)}`} />
                                <Chip label={`${t('pricing.recAdr')} ${formatBaht(detail.room.recommendation.target)}`} />
                            </Stack>
                            <Typography variant="body2">{detail.room.recommendation.reason}</Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('pricing.channel')}</TableCell>
                                        <TableCell>k</TableCell>
                                        <TableCell>{t('pricing.channelPrice')}</TableCell>
                                        <TableCell>NET</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {detail.room.recommendation.channelNet.map((row) => (
                                        <TableRow key={row.channel}>
                                            <TableCell>{t(`pricing.channels.${row.channel}`)}</TableCell>
                                            <TableCell>{row.k}</TableCell>
                                            <TableCell>{formatBaht(row.price)}</TableCell>
                                            <TableCell>{formatBaht(row.net)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Typography variant="caption" color="text.secondary">
                                {t('pricing.channelNote')} · {t('pricing.pEff')} {formatBaht(detail.room.recommendation.pEff)}
                            </Typography>
                            <TextField
                                label={t('pricing.manualOverride')}
                                value={overrideValue}
                                onChange={(e) => setOverrideValue(e.target.value)}
                                type="number"
                            />
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetail(null)}>{t('common.close')}</Button>
                    <Button variant="contained" disabled={busy} onClick={() => void handleOverride()}>
                        {t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

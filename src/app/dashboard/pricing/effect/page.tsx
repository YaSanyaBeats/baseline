'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
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
import EffectChart from '@/components/pricing/EffectChart';
import { usePricingNotify } from '@/components/pricing/usePricingNotify';
import { useTranslation } from '@/i18n/useTranslation';
import { addChannelEvent, fetchEffectChart, rollbackPriceChange } from '@/lib/pricing/client';
import { buildEffectCsv } from '@/lib/pricing/effectCsv';
import type { ChartPayload, EffectOptions, EffectScope, PriceChangeSnapshot, RecommendationSummary } from '@/lib/pricing/effectTypes';
import {
    PERIOD_IDS,
    availableSeasonYears,
    defaultPeriodForToday,
    formatPeriodRange,
    resolvePeriodWindow,
    seasonYearForDate,
    type PeriodId,
} from '@/lib/pricing/periods';

const INK = '#dce8f5';
const INK2 = '#8ba3be';
const SURFACE = '#162030';
const BORDER = '#253647';
const GREEN = '#3fc48a';
const RED = '#e85252';
const WARN = '#d4a235';

function num(v: number | null | undefined, digits = 1): string {
    if (v == null || Number.isNaN(v)) return '—';
    return v.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function baht(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return '—';
    return `${Math.round(v).toLocaleString('ru-RU')} ฿`;
}

function signed(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return '—';
    return `${v > 0 ? '+' : ''}${num(v, 1)}`;
}

function initiatorLabel(t: (key: string) => string, initiator: string): string {
    if (initiator.startsWith('override:')) return `${t('pricing.effect.initiator.override')} · ${initiator.slice(9)}`;
    if (initiator.startsWith('manager:')) return `${t('pricing.effect.initiator.manager')} · ${initiator.slice(8)}`;
    if (initiator === 'engine') return t('pricing.effect.initiator.engine');
    return initiator;
}

function snapshotBody(t: (key: string) => string, snap: PriceChangeSnapshot): string {
    if (!snap.complete) {
        return snap.reason || t('pricing.effect.snapshotIncomplete');
    }
    const parts = [`${snap.mode}`, `RPI ${snap.rpi ?? '—'}`];
    if (snap.market_anchor) {
        parts.push(
            `${t('pricing.effect.anchor')} ${baht(snap.market_anchor.price_thb)} (${snap.market_anchor.confidence}, ${t('pricing.effect.weight')} ${Math.round(snap.market_anchor.weight * 100)}%)`,
        );
    }
    if (snap.pace_vs_norm_pct != null) parts.push(`${t('pricing.effect.pace')} ${num(snap.pace_vs_norm_pct, 1)}%`);
    if (snap.guards_triggered.length) {
        parts.push(snap.guards_triggered.map((guard) => guard.effect).join(', '));
    } else {
        parts.push(t('pricing.effect.guardsNone'));
    }
    if (snap.reason) parts.push(snap.reason);
    return parts.join('. ');
}

export default function EffectChartPage() {
    const { t } = useTranslation();
    const notify = usePricingNotify();
    const [scope, setScope] = useState<EffectScope>('portfolio');
    const [scopeId, setScopeId] = useState('all');
    const [period, setPeriod] = useState<PeriodId>(defaultPeriodForToday());
    const [year, setYear] = useState(() => seasonYearForDate());
    const [custom, setCustom] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [effectWindow, setEffectWindow] = useState(14);
    const [compareYear, setCompareYear] = useState<number | ''>('');
    const [loading, setLoading] = useState(true);
    const [chart, setChart] = useState<ChartPayload | null>(null);
    const [summary, setSummary] = useState<RecommendationSummary | null>(null);
    const [options, setOptions] = useState<EffectOptions>({ clusters: [], rooms: [] });
    const [selected, setSelected] = useState<string | null>(null);
    const [eventOpen, setEventOpen] = useState(false);
    const [eventType, setEventType] = useState('calendar_event');
    const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [eventText, setEventText] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchEffectChart({
                scope,
                scopeId: scope === 'portfolio' ? 'all' : scopeId,
                period: custom ? 'custom' : period,
                year,
                dateFrom: custom ? dateFrom : undefined,
                dateTo: custom ? dateTo : undefined,
                effectWindow,
                compareYear: compareYear === '' ? null : compareYear,
            });
            setChart(data.chart);
            setSummary(data.summary);
            setOptions(data.options);
        } catch {
            notify(t('pricing.loadError'), 'error');
        } finally {
            setLoading(false);
        }
    }, [scope, scopeId, period, year, custom, dateFrom, dateTo, effectWindow, compareYear, notify, t]);

    useEffect(() => {
        if (scope === 'cluster' && !scopeId && options.clusters[0]) setScopeId(options.clusters[0].id);
        if (scope === 'room' && !scopeId && options.rooms[0]) setScopeId(options.rooms[0].id);
    }, [scope, scopeId, options]);

    useEffect(() => {
        if (custom && (!dateFrom || !dateTo)) return;
        if (scope !== 'portfolio' && !scopeId) return;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, scopeId, period, year, custom, dateFrom, dateTo, effectWindow, compareYear]);

    const selectChange = (id: string) => {
        setSelected(id);
        document.getElementById(`px-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    const downloadCsv = () => {
        if (!chart) return;
        const blob = new Blob([buildEffectCsv(chart)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `effect-${chart.meta.scope}-${chart.meta.period_code}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const rollback = async (id: string) => {
        setBusy(true);
        try {
            const res = await rollbackPriceChange(id);
            notify(res.message || t('pricing.effect.rollbackDone'), 'success');
            await load();
        } catch {
            notify(t('pricing.effect.rollbackFail'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const saveEvent = async () => {
        setBusy(true);
        try {
            const affectedScope = scope === 'portfolio' ? 'all' : scopeId;
            await addChannelEvent({ eventAt: eventDate, eventType, description: eventText, affectedScope });
            notify(t('pricing.effect.eventSaved'), 'success');
            setEventOpen(false);
            setEventText('');
            await load();
        } catch {
            notify(t('pricing.saveError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const scopeChoices = scope === 'cluster' ? options.clusters : options.rooms.filter((room) => scope === 'room');
    const windowLabel = chart ? `${chart.meta.date_from} — ${chart.meta.date_to}` : '';
    const lowConfidence = chart?.effect_table.some((row) => row.confidence === 'low');
    const alerts = chart?.effect_table.filter((row) => row.alert) || [];

    return (
        <Stack spacing={2}>
            <Box>
                <Typography sx={{ color: '#3b9eff', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {t('pricing.effect.eyebrow')}
                </Typography>
                <Typography variant="h6" sx={{ fontFamily: 'ui-monospace, monospace' }}>
                    {t('pricing.effect.title')}
                </Typography>
                {chart && (
                    <Typography variant="body2" color="text.secondary">
                        {chart.meta.scope_label === 'all' ? t('pricing.effect.scopePortfolio') : chart.meta.scope_label}
                        {' · '}
                        {chart.meta.period_code} · {windowLabel}
                    </Typography>
                )}
            </Box>

            <Paper sx={{ p: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} flexWrap="wrap" useFlexGap>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>{t('pricing.effect.scope')}</InputLabel>
                        <Select
                            label={t('pricing.effect.scope')}
                            value={scope}
                            onChange={(e) => {
                                const next = e.target.value as EffectScope;
                                setScope(next);
                                setScopeId(next === 'portfolio' ? 'all' : '');
                            }}
                        >
                            <MenuItem value="portfolio">{t('pricing.effect.scopePortfolio')}</MenuItem>
                            <MenuItem value="cluster">{t('pricing.effect.scopeCluster')}</MenuItem>
                            <MenuItem value="room">{t('pricing.effect.scopeRoom')}</MenuItem>
                        </Select>
                    </FormControl>
                    {scope !== 'portfolio' && (
                        <FormControl size="small" sx={{ minWidth: 260 }}>
                            <InputLabel>{scope === 'cluster' ? t('pricing.cluster') : t('pricing.effect.scopeRoom')}</InputLabel>
                            <Select
                                label={scope === 'cluster' ? t('pricing.cluster') : t('pricing.effect.scopeRoom')}
                                value={scopeId}
                                onChange={(e) => setScopeId(String(e.target.value))}
                            >
                                {scopeChoices.map((item) => (
                                    <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                    <FormControl size="small" sx={{ minWidth: 110 }}>
                        <InputLabel>{t('pricing.year')}</InputLabel>
                        <Select label={t('pricing.year')} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                            {availableSeasonYears().map((y) => (
                                <MenuItem key={y} value={y}>{y}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {!custom && (
                        <FormControl size="small" sx={{ minWidth: 240 }}>
                            <InputLabel>{t('pricing.period')}</InputLabel>
                            <Select label={t('pricing.period')} value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
                                {PERIOD_IDS.map((id) => {
                                    const w = resolvePeriodWindow(id, year);
                                    return <MenuItem key={id} value={id}>{formatPeriodRange(w.start, w.end)}</MenuItem>;
                                })}
                            </Select>
                        </FormControl>
                    )}
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                        <InputLabel>{t('pricing.effect.window')}</InputLabel>
                        <Select label={t('pricing.effect.window')} value={effectWindow} onChange={(e) => setEffectWindow(Number(e.target.value))}>
                            {[7, 14, 21, 28].map((n) => (
                                <MenuItem key={n} value={n}>±{n}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>{t('pricing.effect.compareYear')}</InputLabel>
                        <Select
                            label={t('pricing.effect.compareYear')}
                            value={compareYear}
                            onChange={(e) => {
                                const raw = String(e.target.value);
                                setCompareYear(raw === '' ? '' : Number(raw));
                            }}
                        >
                            <MenuItem value="">{t('pricing.effect.compareNone')}</MenuItem>
                            {availableSeasonYears().filter((y) => y !== year).map((y) => (
                                <MenuItem key={y} value={y}>{y}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Button variant="outlined" onClick={() => setCustom((v) => !v)}>
                        {t('pricing.effect.custom')}
                    </Button>
                    <Button variant="outlined" onClick={downloadCsv} disabled={!chart}>{t('pricing.effect.exportCsv')}</Button>
                    <Button variant="outlined" onClick={() => setEventOpen(true)}>{t('pricing.effect.addEvent')}</Button>
                </Stack>
                {custom && (
                    <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                        <TextField size="small" type="date" label={t('pricing.effect.dateFrom')} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
                        <TextField size="small" type="date" label={t('pricing.effect.dateTo')} value={dateTo} onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
                    </Stack>
                )}
            </Paper>

            {loading && !chart ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : chart && summary ? (
                <>
                    {chart.meta.history_days < 30 && (
                        <Alert severity="info">{t('pricing.effect.shortHistory')}</Alert>
                    )}
                    {chart.meta.price_history === 'current_only' && (
                        <Alert severity="info">{t('pricing.effect.priceHistory')}</Alert>
                    )}
                    {alerts.map((row) => {
                        const change = chart.price_changes.find((item) => item.id === row.change_id);
                        return (
                            <Alert
                                key={row.change_id}
                                severity="error"
                                action={
                                    <Button color="inherit" size="small" disabled={busy || change?.price_before == null} onClick={() => void rollback(row.change_id)}>
                                        {t('pricing.effect.alertRollback')}
                                    </Button>
                                }
                            >
                                {t('pricing.effect.alertTitle')} {change ? `${baht(change.price_before)} → ${baht(change.price_after)}` : ''}
                            </Alert>
                        );
                    })}

                    <Paper sx={{ p: 2, bgcolor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: INK2, mb: 1.5 }}>
                            {t('pricing.effect.summaryTitle')}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`${t('pricing.effect.summary.total')} ${summary.total_changes}`} sx={{ bgcolor: '#1e2f42', color: INK }} />
                            <Chip label={`${t('pricing.effect.initiator.engine')} ${summary.by_initiator.engine}`} sx={{ bgcolor: '#1e2f42', color: INK }} />
                            <Chip label={`${t('pricing.effect.initiator.manager')} ${summary.by_initiator.manager}`} sx={{ bgcolor: '#1e2f42', color: INK }} />
                            <Chip label={`${t('pricing.effect.initiator.override')} ${summary.by_initiator.override}`} sx={{ bgcolor: '#1e2f42', color: INK }} />
                            <Chip label={`${t('pricing.effect.verdict.confirmed')} ${summary.by_verdict.confirmed}`} sx={{ bgcolor: '#10341f', color: GREEN }} />
                            <Chip label={`${t('pricing.effect.verdict.neutral')} ${summary.by_verdict.neutral}`} sx={{ bgcolor: '#1e2f42', color: INK2 }} />
                            <Chip label={`${t('pricing.effect.verdict.bad')} ${summary.by_verdict.bad}`} sx={{ bgcolor: 'rgba(232,82,82,.12)', color: RED }} />
                            <Chip
                                label={
                                    summary.revpar_vs_control.delta_thb == null
                                        ? t('pricing.effect.summary.noControl')
                                        : `${t('pricing.effect.summary.revpar')} ${signed(summary.revpar_vs_control.delta_pct)}%`
                                }
                                sx={{ bgcolor: '#1e2f42', color: INK }}
                            />
                        </Stack>
                    </Paper>

                    <EffectChart
                        payload={chart}
                        selectedId={selected}
                        onSelect={selectChange}
                        fileStem={`effect-${chart.meta.scope}-${chart.meta.period_code}`}
                    />

                    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        {t('pricing.effect.tableTitle')} ±{chart.meta.effect_window}
                    </Typography>
                    <TableContainer component={Paper} sx={{ bgcolor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    {[
                                        t('pricing.effect.col.day'),
                                        t('pricing.effect.col.change'),
                                        t('pricing.effect.col.initiator'),
                                        t('pricing.effect.col.before'),
                                        t('pricing.effect.col.after'),
                                        t('pricing.effect.col.delta'),
                                        t('pricing.effect.col.control'),
                                        t('pricing.effect.col.above'),
                                        t('pricing.effect.col.adr'),
                                        t('pricing.effect.col.verdict'),
                                    ].map((label) => (
                                        <TableCell key={label} sx={{ color: INK2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{label}</TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {chart.effect_table.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={10} sx={{ color: INK2 }}>{t('pricing.effect.emptyChanges')}</TableCell>
                                    </TableRow>
                                )}
                                {chart.effect_table.map((row) => {
                                    const change = chart.price_changes.find((item) => item.id === row.change_id);
                                    const pct = change?.price_before ? Math.round((change.price_after / change.price_before - 1) * 100) : null;
                                    return (
                                        <TableRow key={row.change_id} hover selected={selected === row.change_id} onClick={() => setSelected(row.change_id)} sx={{ cursor: 'pointer' }}>
                                            <TableCell sx={{ color: INK, fontFamily: 'ui-monospace, monospace' }}>−{change?.days_before ?? '—'} {t('pricing.effect.dayShort')}</TableCell>
                                            <TableCell sx={{ color: INK, fontFamily: 'ui-monospace, monospace' }}>
                                                {change ? `${baht(change.price_before)} → ${baht(change.price_after)}` : '—'}
                                                {pct != null && <Typography component="span" variant="caption" sx={{ color: INK2 }}> ({pct > 0 ? '+' : ''}{pct}%)</Typography>}
                                            </TableCell>
                                            <TableCell sx={{ color: INK2 }}>{change ? initiatorLabel(t, change.initiator) : '—'}</TableCell>
                                            <TableCell sx={{ color: INK2, fontFamily: 'ui-monospace, monospace' }}>{num(row.pace_before)}</TableCell>
                                            <TableCell sx={{ color: INK2, fontFamily: 'ui-monospace, monospace' }}>{num(row.pace_after)}</TableCell>
                                            <TableCell sx={{ color: row.delta_pace >= 0 ? GREEN : RED, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{signed(row.delta_pace)}</TableCell>
                                            <TableCell sx={{ color: INK2, fontFamily: 'ui-monospace, monospace' }}>
                                                {signed(row.control_delta)}
                                                <Typography variant="caption" display="block" sx={{ color: INK2 }}>n={row.control_group_size}</Typography>
                                            </TableCell>
                                            <TableCell sx={{ color: (row.above_control ?? 0) >= 0 ? GREEN : RED, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{signed(row.above_control)}</TableCell>
                                            <TableCell sx={{ color: INK, fontFamily: 'ui-monospace, monospace' }}>{baht(row.adr_after)}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    label={t(`pricing.effect.verdict.${row.verdict}`)}
                                                    sx={{
                                                        bgcolor: row.verdict === 'confirmed' ? '#10341f' : row.verdict === 'bad' ? 'rgba(232,82,82,.12)' : '#1e2f42',
                                                        color: row.verdict === 'confirmed' ? GREEN : row.verdict === 'bad' ? RED : INK2,
                                                        fontWeight: 700,
                                                    }}
                                                />
                                                <Typography variant="caption" display="block" sx={{ color: INK2, mt: 0.5 }}>
                                                    {t(`pricing.effect.confidence.${row.confidence}`)}
                                                    {!row.window_complete ? ` · ${t('pricing.effect.partialWindow')}` : ''}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                        <Typography sx={{ px: 2, py: 1.25, color: INK2, fontSize: 12, borderTop: `1px solid ${BORDER}` }}>
                            {t('pricing.effect.controlNote')}
                        </Typography>
                    </TableContainer>
                    {lowConfidence && <Alert severity="warning">{t('pricing.effect.confidenceWarn')}</Alert>}

                    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.secondary' }}>
                        {t('pricing.effect.cardsTitle')}
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                        {chart.price_changes.map((change) => {
                            const delta = change.price_before == null ? null : change.price_after - change.price_before;
                            return (
                                <Paper id={`px-${change.id}`} key={change.id} sx={{ p: 2, pl: 2.5, position: 'relative', bgcolor: SURFACE, color: INK, border: `1px solid ${selected === change.id ? '#3b9eff' : BORDER}` }}>
                                    <Box sx={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, bgcolor: RED, borderRadius: '0 2px 2px 0' }} />
                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                                        <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>−{change.days_before} {t('pricing.effect.dayShort')}</Typography>
                                        <Typography sx={{ fontFamily: 'ui-monospace, monospace', color: INK2 }}>
                                            {baht(change.price_before)} → {baht(change.price_after)}
                                            {delta != null && <Box component="span" sx={{ color: delta >= 0 ? GREEN : RED }}> ({delta > 0 ? '+' : ''}{delta}฿)</Box>}
                                        </Typography>
                                        <Chip size="small" label={initiatorLabel(t, change.initiator)} sx={{ ml: 'auto', bgcolor: '#1e2f42', color: INK2 }} />
                                    </Stack>
                                    <Typography variant="body2" sx={{ color: INK2, lineHeight: 1.65 }}>{snapshotBody(t, change.snapshot)}</Typography>
                                    {!change.snapshot.complete && (
                                        <Typography variant="caption" sx={{ color: WARN }}>{t('pricing.effect.snapshotIncomplete')}</Typography>
                                    )}
                                </Paper>
                            );
                        })}
                        {chart.external_events.map((event) => (
                            <Paper id={`px-${event.id}`} key={event.id} sx={{ p: 2, pl: 2.5, position: 'relative', bgcolor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}>
                                <Box sx={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, bgcolor: WARN, borderRadius: '0 2px 2px 0' }} />
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                    <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>−{event.days_before} {t('pricing.effect.dayShort')}</Typography>
                                    <Chip size="small" label={t('pricing.effect.initiator.event')} sx={{ ml: 'auto', bgcolor: '#2e2208', color: WARN }} />
                                </Stack>
                                <Typography variant="body2" sx={{ color: INK2 }}>{event.description}</Typography>
                            </Paper>
                        ))}
                        {chart.price_changes.length === 0 && chart.external_events.length === 0 && (
                            <Typography variant="body2" color="text.secondary">{t('pricing.effect.emptyEvents')}</Typography>
                        )}
                    </Box>

                    <Paper sx={{ p: 2, borderLeft: `3px solid ${WARN}`, bgcolor: SURFACE, color: INK2 }}>
                        <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                            <Box component="strong" sx={{ color: WARN }}>{t('pricing.effect.attrTitle')}</Box> {t('pricing.effect.attrBody')}
                        </Typography>
                        <Typography variant="body2" sx={{ lineHeight: 1.7, mt: 1 }}>
                            <Box component="strong" sx={{ color: WARN }}>{t('pricing.effect.attrChannelsTitle')}</Box> {t('pricing.effect.attrChannels')}
                        </Typography>
                    </Paper>
                </>
            ) : null}

            <Dialog open={eventOpen} onClose={() => setEventOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{t('pricing.effect.addEvent')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>{t('pricing.effect.eventType')}</InputLabel>
                            <Select label={t('pricing.effect.eventType')} value={eventType} onChange={(e) => setEventType(String(e.target.value))}>
                                {['channel_connect', 'channel_close', 'campaign_start', 'calendar_event', 'ota_closure'].map((id) => (
                                    <MenuItem key={id} value={id}>{t(`pricing.effect.eventTypes.${id}`)}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField size="small" type="date" label={t('pricing.effect.eventDate')} value={eventDate} onChange={(e) => setEventDate(e.target.value)} InputLabelProps={{ shrink: true }} />
                        <TextField label={t('pricing.effect.eventDescription')} value={eventText} onChange={(e) => setEventText(e.target.value)} multiline minRows={2} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEventOpen(false)}>{t('common.cancel')}</Button>
                    <Button variant="contained" disabled={busy || !eventText.trim()} onClick={() => void saveEvent()}>{t('common.save')}</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

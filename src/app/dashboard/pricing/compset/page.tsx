'use client';

import { useEffect, useState, Fragment } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    LinearProgress,
    MenuItem,
    Paper,
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
import StarIcon from '@mui/icons-material/Star';
import { useTranslation } from '@/i18n/useTranslation';
import { usePricingNotify } from '@/components/pricing/usePricingNotify';
import { PERIOD_IDS, defaultPeriodForToday, type PeriodId } from '@/lib/pricing/periods';
import {
    addCompetitors,
    discoverCluster,
    enableApify,
    fetchApifyStatus,
    fetchCompetitors,
    patchCompetitor,
    resetApifyLimits,
    runApify,
    stopApify,
} from '@/lib/pricing/client';
import type { CompetitorPlatform } from '@/lib/pricing/types';

const DISCOVERY_PLATFORMS: CompetitorPlatform[] = ['airbnb', 'booking', 'agoda', 'trip'];

function formatScrapedAt(value: string | Date | null | undefined, language: string) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(language === 'en' ? 'en-GB' : 'ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function CompsetPage() {
    const { t, language } = useTranslation();
    const notify = usePricingNotify();
    const [loading, setLoading] = useState(true);
    const [clusters, setClusters] = useState<any[]>([]);
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [apify, setApify] = useState<any>(null);
    const [addFor, setAddFor] = useState<string | null>(null);
    const [urls, setUrls] = useState('');
    const [period, setPeriod] = useState<PeriodId>(defaultPeriodForToday());
    const [busy, setBusy] = useState(false);
    const [discoverFor, setDiscoverFor] = useState<string | null>(null);
    const [discoverPlatform, setDiscoverPlatform] = useState<CompetitorPlatform>('airbnb');

    const load = async () => {
        setLoading(true);
        try {
            const [comp, status] = await Promise.all([fetchCompetitors(), fetchApifyStatus()]);
            setClusters(comp);
            setApify(status);
        } catch {
            notify(t('pricing.loadError'), 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAdd = async () => {
        if (!addFor) return;
        const list = urls
            .split(/[\s,;]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        setBusy(true);
        try {
            await addCompetitors(addFor, list);
            setAddFor(null);
            setUrls('');
            await load();
            notify(t('common.save'), 'success');
        } catch {
            notify(t('pricing.saveError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const scrape = async (id: string) => {
        if (!apify?.tokenConfigured) {
            notify(t('pricing.apifyNoToken'), 'warning');
            return;
        }
        setBusy(true);
        try {
            const res = await runApify(id, period);
            if (!res.success) throw new Error(res.message);
            const warnings: string[] = res.data?.warnings || [];
            if (warnings.length) {
                notify(
                    `${t('pricing.scrapeIncomplete')}: ${warnings.map((w) => t(`pricing.scrapeWarn.${w}`)).join(', ')}`,
                    'warning',
                );
            } else {
                notify(`${t('pricing.apifyDone')} $${Number(res.data?.costUsd || 0).toFixed(3)}`, 'success');
            }
            await load();
        } catch (e) {
            notify(e instanceof Error ? e.message : t('pricing.saveError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const runDiscovery = async () => {
        if (!discoverFor) return;
        if (!apify?.tokenConfigured) {
            notify(t('pricing.apifyNoToken'), 'warning');
            return;
        }
        setBusy(true);
        try {
            const res = await discoverCluster(discoverFor, discoverPlatform);
            if (!res.success) throw new Error(res.message);
            notify(
                `${t('pricing.discoveryDone')}: ${res.data?.inserted ?? 0} · $${Number(res.data?.costUsd || 0).toFixed(3)}`,
                'success',
            );
            setDiscoverFor(null);
            await load();
        } catch (e) {
            notify(e instanceof Error ? e.message : t('pricing.saveError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Stack spacing={2}>
            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                    {t('pricing.apifyBudget')}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="caption">{t('pricing.apifyDay')}</Typography>
                        <LinearProgress
                            variant="determinate"
                            value={Math.min(100, (apify?.dayLimitPct || 0) * 100)}
                            color={(apify?.dayLimitPct || 0) >= 0.8 ? 'error' : 'primary'}
                        />
                        <Typography variant="caption">
                            ${Number(apify?.daySpent || 0).toFixed(2)} / ${apify?.settings?.perDayUsd}
                        </Typography>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="caption">{t('pricing.apifyMonth')}</Typography>
                        <LinearProgress
                            variant="determinate"
                            value={Math.min(100, (apify?.monthLimitPct || 0) * 100)}
                            color={(apify?.monthLimitPct || 0) >= 0.8 ? 'error' : 'primary'}
                        />
                        <Typography variant="caption">
                            ${Number(apify?.monthSpent || 0).toFixed(2)} / ${apify?.settings?.perMonthUsd}
                        </Typography>
                    </Box>
                    {apify?.settings?.scrapingEnabled ? (
                        <Button color="error" variant="outlined" onClick={() => void stopApify().then(load)}>
                            {t('pricing.apifyStop')}
                        </Button>
                    ) : (
                        <Button variant="outlined" onClick={() => void enableApify().then(load)}>
                            {t('pricing.apifyEnable')}
                        </Button>
                    )}
                    <Button
                        variant="outlined"
                        disabled={busy}
                        onClick={async () => {
                            setBusy(true);
                            try {
                                const res = await resetApifyLimits();
                                if (!res.success) throw new Error(res.message);
                                const status = await fetchApifyStatus();
                                setApify(status);
                                notify(t('pricing.apifyLimitsReset'), 'success');
                            } catch (e) {
                                notify(e instanceof Error ? e.message : t('pricing.saveError'), 'error');
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        {t('pricing.apifyResetLimits')}
                    </Button>
                </Stack>
                {!apify?.tokenConfigured && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                        {t('pricing.apifyNoToken')}
                    </Alert>
                )}
                <Alert severity="info" sx={{ mt: 2 }}>
                    {t('pricing.scrapeHow')}
                </Alert>
            </Paper>

            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell />
                            <TableCell>{t('pricing.clusterObject')}</TableCell>
                            <TableCell>{t('pricing.objects')}</TableCell>
                            <TableCell>{t('pricing.coverage')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {clusters.map((cl) => (
                            <Fragment key={cl.cluster}>
                                <TableRow
                                    hover
                                    sx={{ cursor: 'pointer' }}
                                    onClick={() => setOpen((s) => ({ ...s, [cl.cluster]: !s[cl.cluster] }))}
                                >
                                    <TableCell width={36}>
                                        <IconButton size="small">
                                            {open[cl.cluster] ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                        </IconButton>
                                    </TableCell>
                                    <TableCell>{cl.cluster}</TableCell>
                                    <TableCell>{cl.objects}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            color={cl.approved >= 5 ? 'success' : cl.approved > 0 ? 'warning' : 'default'}
                                            label={`${cl.approved || 0}/${cl.total || 0} ${t('pricing.approvedUrls')}`}
                                        />
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell colSpan={4} sx={{ py: 0, border: 0 }}>
                                        <Collapse in={Boolean(open[cl.cluster])} unmountOnExit>
                                            <Box sx={{ p: 2 }}>
                                                <Alert severity="info" sx={{ mb: 2 }}>
                                                    {t('pricing.sharedSetHint')}
                                                </Alert>
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
                                                    <Button size="small" variant="contained" onClick={() => setAddFor(cl.cluster)}>
                                                        {t('pricing.addCompetitor')}
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        disabled={busy || !apify?.tokenConfigured}
                                                        onClick={() => setDiscoverFor(cl.cluster)}
                                                    >
                                                        {t('pricing.discovery')}
                                                    </Button>
                                                </Stack>
                                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                                                    {cl.rooms.map((room: any) => (
                                                        <Chip key={room.roomId} size="small" label={`${room.name} #${room.roomId}`} />
                                                    ))}
                                                </Stack>
                                                {(cl.competitors || []).map((c: any) => {
                                                    const scrapedAt = formatScrapedAt(c.lastScrapedAt || c.updatedAt, language);
                                                    const byStay = c.lastPriceByStay || {};
                                                    const p14 = Number(byStay[14] || 0) > 0 ? Number(byStay[14]) : null;
                                                    const p20 = Number(byStay[20] || 0) > 0 ? Number(byStay[20]) : null;
                                                    const fallbackPrice = Number(c.lastPrice) > 0 ? Number(c.lastPrice) : null;
                                                    const money = (n: number) =>
                                                        Math.round(n).toLocaleString(language === 'en' ? 'en-US' : 'ru-RU');
                                                    const priceText = [
                                                        p14 != null ? `${money(p14)} ฿ / 14н` : null,
                                                        p20 != null ? `${money(p20)} ฿ / 20н` : null,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' · ');
                                                    const warnings: string[] = Array.isArray(c.lastWarnings) ? c.lastWarnings : [];
                                                    return (
                                                    <Stack
                                                        key={c._id}
                                                        direction={{ xs: 'column', sm: 'row' }}
                                                        spacing={1}
                                                        alignItems={{ sm: 'center' }}
                                                        sx={{ mt: 1 }}
                                                    >
                                                        <Chip size="small" label={t(`pricing.platforms.${c.platform}`)} />
                                                        <Chip size="small" variant="outlined" label={t(`pricing.competitorStatus.${c.status}`)} />
                                                        <Chip
                                                            size="small"
                                                            icon={<StarIcon sx={{ fontSize: 16 }} />}
                                                            color={c.lastRating != null ? 'warning' : 'default'}
                                                            variant={c.lastRating != null ? 'filled' : 'outlined'}
                                                            label={
                                                                c.lastRating != null
                                                                    ? `${Number(c.lastRating).toFixed(1)}${c.lastReviews ? ` (${c.lastReviews})` : ''}`
                                                                    : t('pricing.noRating')
                                                            }
                                                        />
                                                        <Typography variant="body2" sx={{ flex: 1, minWidth: 120 }}>
                                                            {c.name}
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                                                            {priceText || (fallbackPrice != null ? `${money(fallbackPrice)} ฿` : '—')}
                                                        </Typography>
                                                        {warnings.length > 0 && (
                                                            <Chip
                                                                size="small"
                                                                color="warning"
                                                                label={warnings.map((w) => t(`pricing.scrapeWarn.${w}`)).join(', ')}
                                                            />
                                                        )}
                                                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                                            {scrapedAt ? `${t('pricing.lastScraped')} ${scrapedAt}` : '—'}
                                                        </Typography>
                                                        <Button size="small" href={c.url} target="_blank" rel="noreferrer">
                                                            URL
                                                        </Button>
                                                        {c.status === 'candidate' && (
                                                            <Button
                                                                size="small"
                                                                onClick={() => void patchCompetitor(c._id, { status: 'approved' }).then(load)}
                                                            >
                                                                {t('pricing.approveCandidate')}
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="small"
                                                            disabled={busy || !apify?.tokenConfigured}
                                                            onClick={() => void scrape(c._id)}
                                                        >
                                                            {t('pricing.scrape')}
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            color="error"
                                                            onClick={() => void patchCompetitor(c._id, { status: 'blocked' }).then(load)}
                                                        >
                                                            {t('common.delete')}
                                                        </Button>
                                                    </Stack>
                                                    );
                                                })}
                                                {!(cl.competitors || []).length && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {t('pricing.noCompetitors')}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Collapse>
                                    </TableCell>
                                </TableRow>
                            </Fragment>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={addFor != null} onClose={() => setAddFor(null)} fullWidth>
                <DialogTitle>{t('pricing.addCompetitor')}</DialogTitle>
                <DialogContent>
                    <TextField
                        sx={{ mt: 1 }}
                        fullWidth
                        multiline
                        minRows={4}
                        label={t('pricing.urlsHint')}
                        value={urls}
                        onChange={(e) => setUrls(e.target.value)}
                    />
                    <TextField
                        sx={{ mt: 2 }}
                        select
                        SelectProps={{ native: true }}
                        label={t('pricing.period')}
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as PeriodId)}
                    >
                        {PERIOD_IDS.map((id) => (
                            <option key={id} value={id}>
                                {id}
                            </option>
                        ))}
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddFor(null)}>{t('common.cancel')}</Button>
                    <Button variant="contained" disabled={busy} onClick={() => void handleAdd()}>
                        {t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={discoverFor != null} onClose={() => setDiscoverFor(null)} fullWidth>
                <DialogTitle>{t('pricing.discovery')}</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
                        {t('pricing.discoveryHint')}
                    </Alert>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {discoverFor}
                    </Typography>
                    <TextField
                        select
                        fullWidth
                        label={t('pricing.channel')}
                        value={discoverPlatform}
                        onChange={(e) => setDiscoverPlatform(e.target.value as CompetitorPlatform)}
                    >
                        {DISCOVERY_PLATFORMS.map((p) => (
                            <MenuItem key={p} value={p}>
                                {t(`pricing.platforms.${p}`)}
                            </MenuItem>
                        ))}
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDiscoverFor(null)}>{t('common.cancel')}</Button>
                    <Button variant="contained" disabled={busy} onClick={() => void runDiscovery()}>
                        {t('pricing.discovery')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

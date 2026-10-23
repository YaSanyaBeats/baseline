'use client';

import { useEffect, useRef, useState, Fragment } from 'react';
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
import {
    DEFAULT_DISCOVERY_LIMITS,
    DISCOVERY_LIMIT_MAX,
    DISCOVERY_PLATFORM_ORDER,
    DISCOVERY_SEARCH_USD,
} from '@/lib/pricing/discoveryMix';
import type { CompetitorPlatform } from '@/lib/pricing/types';
import {
    PERIOD_IDS,
    defaultPeriodForToday,
    formatPeriodRange,
    resolvePeriodWindow,
    seasonYearForDate,
    type PeriodId,
} from '@/lib/pricing/periods';
import {
    addCompetitors,
    deleteCompetitor,
    discoverCluster,
    enableApify,
    fetchApifyStatus,
    fetchCompetitors,
    fetchScrapeQueue,
    patchCompetitor,
    resetApifyLimits,
    runApify,
    runClusterApify,
    saveApifySettings,
    stopApify,
    type ScrapeJobView,
} from '@/lib/pricing/client';

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

function formatStayDates(checkIn?: string | null, checkOut?: string | null, language?: string) {
    if (!checkIn || !checkOut) return null;
    const loc = language === 'en' ? 'en-GB' : 'ru-RU';
    const a = new Date(`${checkIn.slice(0, 10)}T00:00:00`);
    const b = new Date(`${checkOut.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${checkIn} – ${checkOut}`;
    const fmt = (d: Date) =>
        d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${fmt(a)} – ${fmt(b)}`;
}

function isActive(job: ScrapeJobView) {
    return job.status === 'queued' || job.status === 'running';
}

function errorMessage(error: unknown, fallback: string) {
    if (typeof error === 'object' && error && 'response' in error) {
        const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
        if (message) return message;
    }
    return error instanceof Error ? error.message : fallback;
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
    const [discoveryLimits, setDiscoveryLimits] = useState<Record<CompetitorPlatform, number>>({
        ...DEFAULT_DISCOVERY_LIMITS,
    });
    const [editFor, setEditFor] = useState<{ id: string; name: string; url: string } | null>(null);
    const [moveFor, setMoveFor] = useState<{ id: string; from: string; to: string } | null>(null);
    const [deleteFor, setDeleteFor] = useState<{ id: string; name: string; url: string } | null>(null);
    const [activeJobs, setActiveJobs] = useState<ScrapeJobView[]>([]);
    const [pendingKeys, setPendingKeys] = useState<Record<string, true>>({});
    const watchingRef = useRef<Set<string>>(new Set());
    const notifyRef = useRef(notify);
    const tRef = useRef(t);
    notifyRef.current = notify;
    tRef.current = t;

    const seasonYear = seasonYearForDate();

    const load = async () => {
        setLoading(true);
        try {
            const [comp, status] = await Promise.all([fetchCompetitors(), fetchApifyStatus()]);
            setClusters(comp);
            setApify(status);
            const saved = status?.settings?.scrapePeriod;
            if (saved && (PERIOD_IDS as readonly string[]).includes(saved)) {
                setPeriod(saved as PeriodId);
            }
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

    useEffect(() => {
        let stop = false;

        const reloadQuiet = async () => {
            try {
                const [comp, status] = await Promise.all([fetchCompetitors(), fetchApifyStatus()]);
                if (stop) return;
                setClusters(comp);
                setApify(status);
            } catch {
                // Следующий опрос повторит загрузку.
            }
        };

        const apply = (data: { active: ScrapeJobView[]; recent: ScrapeJobView[] }) => {
            const active = data.active || [];
            const recent = new Map((data.recent || []).map((job) => [job.id, job]));
            const translate = tRef.current;
            const tell = notifyRef.current;
            let refresh = false;

            for (const id of [...watchingRef.current]) {
                if (active.some((job) => job.id === id)) continue;
                const job = recent.get(id);
                if (!job) continue;
                watchingRef.current.delete(id);
                if (job.status === 'cancelled') continue;
                refresh = true;
                if (job.status === 'failed') {
                    tell(job.error || translate('pricing.saveError'), 'error');
                    continue;
                }
                const cost = Number(job.result?.costUsd || 0);
                if (job.kind === 'cluster') {
                    const done = Number(job.result?.done || 0);
                    const total = Number(job.result?.total || 0);
                    if (total && done < total) {
                        tell(
                            `${translate('pricing.scrapeProgress')} ${done} ${translate('pricing.scrapeProgressOf')} ${total} · $${cost.toFixed(3)}`,
                            'warning',
                        );
                    } else {
                        tell(`${translate('pricing.apifyDone')} $${cost.toFixed(3)}`, 'success');
                    }
                } else {
                    const warnings = job.result?.warnings || [];
                    if (warnings.length) {
                        tell(
                            `${translate('pricing.scrapeIncomplete')}: ${warnings.map((w) => translate(`pricing.scrapeWarn.${w}`)).join(', ')}`,
                            'warning',
                        );
                    } else {
                        tell(`${translate('pricing.apifyDone')} $${cost.toFixed(3)}`, 'success');
                    }
                }
            }

            for (const job of active) watchingRef.current.add(job.id);
            setActiveJobs((prev) => {
                const byId = new Map(active.map((job) => [job.id, job]));
                for (const job of prev) {
                    if (watchingRef.current.has(job.id) && !byId.has(job.id) && !recent.has(job.id)) {
                        byId.set(job.id, job);
                    }
                }
                const next = [...byId.values()];
                const same =
                    prev.length === next.length &&
                    prev.every((job) => next.some((item) => item.id === job.id && item.status === job.status));
                return same ? prev : next;
            });
            if (refresh) void reloadQuiet();
        };

        const tick = async () => {
            while (!stop) {
                try {
                    const data = await fetchScrapeQueue();
                    if (!stop) apply(data);
                } catch {
                    // Следующий опрос.
                }
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        };

        void tick();
        return () => {
            stop = true;
        };
    }, []);

    const changePeriod = async (next: PeriodId) => {
        setPeriod(next);
        try {
            await saveApifySettings({ scrapePeriod: next });
            setApify((s: any) => (s ? { ...s, settings: { ...s.settings, scrapePeriod: next } } : s));
        } catch {
            notify(t('pricing.saveError'), 'error');
        }
    };

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

    const rememberJob = (job: ScrapeJobView | undefined) => {
        if (!job?.id || !isActive(job)) return;
        watchingRef.current.add(job.id);
        setActiveJobs((prev) => [...prev.filter((item) => item.id !== job.id), job]);
    };

    const setPending = (key: string, on: boolean) => {
        setPendingKeys((prev) => {
            if (on) return prev[key] ? prev : { ...prev, [key]: true };
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const clusterQueued = (cluster: string) =>
        Boolean(pendingKeys[`k:${cluster}`]) ||
        activeJobs.some((job) => isActive(job) && job.kind === 'cluster' && job.cluster === cluster);

    const competitorQueued = (id: string, cluster: string) =>
        Boolean(pendingKeys[`c:${id}`] || pendingKeys[`k:${cluster}`]) ||
        activeJobs.some(
            (job) =>
                isActive(job) &&
                ((job.kind === 'competitor' && job.competitorId === id) ||
                    (job.kind === 'cluster' && job.cluster === cluster)),
        );

    const scrape = async (id: string) => {
        if (!apify?.tokenConfigured) {
            notify(t('pricing.apifyNoToken'), 'warning');
            return;
        }
        const key = `c:${id}`;
        setPending(key, true);
        try {
            const res = await runApify(id, period);
            if (!res.success) throw new Error(res.message);
            rememberJob(res.data?.job);
            notify(t('pricing.scrapeQueuedNotice'), 'info');
        } catch (e) {
            notify(errorMessage(e, t('pricing.saveError')), 'error');
        } finally {
            setPending(key, false);
        }
    };

    const scrapeCluster = async (cluster: string, competitors: any[]) => {
        if (!apify?.tokenConfigured) {
            notify(t('pricing.apifyNoToken'), 'warning');
            return;
        }
        const approved = (competitors || []).filter((c) => c.status === 'approved');
        if (!approved.length) {
            notify(t('pricing.scrapeApprovedOnly'), 'warning');
            return;
        }
        const key = `k:${cluster}`;
        setPending(key, true);
        try {
            const res = await runClusterApify(cluster, period);
            if (!res.success) throw new Error(res.message);
            rememberJob(res.data?.job);
            notify(t('pricing.scrapeQueuedNotice'), 'info');
        } catch (e) {
            notify(errorMessage(e, t('pricing.saveError')), 'error');
        } finally {
            setPending(key, false);
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
            const res = await discoverCluster(discoverFor, discoveryLimits);
            if (!res.success) throw new Error(res.message);
            notify(
                `${t('pricing.discoveryDone')}: ${res.data?.inserted ?? 0} · $${Number(res.data?.costUsd || 0).toFixed(3)}`,
                'success',
            );
            setDiscoverFor(null);
            await load();
        } catch (e) {
            notify(errorMessage(e, t('pricing.saveError')), 'error');
        } finally {
            setBusy(false);
        }
    };

    const discoverySearches = DISCOVERY_PLATFORM_ORDER.filter((platform) => discoveryLimits[platform] > 0).length;

    const confirmDelete = async () => {
        if (!deleteFor) return;
        setBusy(true);
        try {
            const res = await deleteCompetitor(deleteFor.id);
            if (!res.success) throw new Error(res.message);
            setDeleteFor(null);
            await load();
            notify(t('pricing.deleteCompetitorDone'), 'success');
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
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
                    <TextField
                        select
                        size="small"
                        label={t('pricing.scrapePeriod')}
                        value={period}
                        disabled={busy}
                        onChange={(e) => void changePeriod(e.target.value as PeriodId)}
                        sx={{ minWidth: 220 }}
                        helperText={t('pricing.scrapePeriodHint')}
                    >
                        {PERIOD_IDS.map((id) => {
                            const w = resolvePeriodWindow(id, seasonYear);
                            return (
                                <MenuItem key={id} value={id}>
                                    {id} · {formatPeriodRange(w.start, w.end)}
                                </MenuItem>
                            );
                        })}
                    </TextField>
                </Stack>
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
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                            <Chip
                                                size="small"
                                                color={cl.approved >= 5 ? 'success' : cl.approved > 0 ? 'warning' : 'default'}
                                                label={`${cl.approved || 0}/${cl.total || 0} ${t('pricing.approvedUrls')}`}
                                            />
                                            {(clusterQueued(cl.cluster) ||
                                                (cl.competitors || []).some((c: { _id: string }) =>
                                                    competitorQueued(c._id, cl.cluster),
                                                )) && (
                                                <Chip size="small" color="info" label={t('pricing.scrapeQueued')} />
                                            )}
                                        </Stack>
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
                                                        disabled={
                                                            clusterQueued(cl.cluster) ||
                                                            !apify?.tokenConfigured ||
                                                            !(cl.approved > 0)
                                                        }
                                                        onClick={() => void scrapeCluster(cl.cluster, cl.competitors || [])}
                                                    >
                                                        {clusterQueued(cl.cluster) ? t('pricing.scrapeQueued') : t('pricing.scrapeCluster')}
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
                                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                                                    {t('pricing.scrapeClusterHint')} · {t('pricing.scrapePeriod')}: {period} ·{' '}
                                                    {formatPeriodRange(
                                                        resolvePeriodWindow(period, seasonYear).start,
                                                        resolvePeriodWindow(period, seasonYear).end,
                                                    )}
                                                </Typography>
                                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                                                    {cl.rooms.map((room: any) => (
                                                        <Chip key={room.roomId} size="small" label={`${room.name} #${room.roomId}`} />
                                                    ))}
                                                </Stack>
                                                {(cl.competitors || []).map((c: any) => {
                                                    const scrapedAt = formatScrapedAt(c.lastScrapedAt || c.updatedAt, language);
                                                    const byStay = c.lastPriceByStay || {};
                                                    const p7 = Number(byStay[7] || 0) > 0 ? Number(byStay[7]) : null;
                                                    const fallbackPrice = Number(c.lastPrice) > 0 ? Number(c.lastPrice) : null;
                                                    const money = (n: number) =>
                                                        Math.round(n).toLocaleString(language === 'en' ? 'en-US' : 'ru-RU');
                                                    const night = language === 'en' ? 'nt' : 'н';
                                                    const priceText =
                                                        p7 != null
                                                            ? `${money(p7)} ฿ / 7${night}`
                                                            : fallbackPrice != null
                                                              ? `${money(fallbackPrice)} ฿ / 7${night}`
                                                              : '—';
                                                    const stayDates = formatStayDates(c.lastCheckIn, c.lastCheckOut, language);
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
                                                            {priceText}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                                            {stayDates
                                                                ? `${t('pricing.scrapeDates')}: ${stayDates}`
                                                                : `${t('pricing.scrapeDates')}: —`}
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
                                                        {c.status === 'candidate' && (
                                                            <Button
                                                                size="small"
                                                                onClick={() =>
                                                                    setMoveFor({
                                                                        id: c._id,
                                                                        from: cl.cluster,
                                                                        to: clusters.find((x) => x.cluster !== cl.cluster)?.cluster || '',
                                                                    })
                                                                }
                                                            >
                                                                {t('pricing.moveCandidate')}
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="small"
                                                            onClick={() => setEditFor({ id: c._id, name: c.name || '', url: c.url || '' })}
                                                        >
                                                            {t('pricing.editUrl')}
                                                        </Button>
                                                        {c.status === 'approved' && (
                                                            <Button
                                                                size="small"
                                                                disabled={competitorQueued(c._id, cl.cluster) || !apify?.tokenConfigured}
                                                                onClick={() => void scrape(c._id)}
                                                            >
                                                                {competitorQueued(c._id, cl.cluster)
                                                                    ? t('pricing.scrapeQueued')
                                                                    : t('pricing.scrape')}
                                                            </Button>
                                                        )}
                                                        {c.status === 'blocked' ? (
                                                            <Button
                                                                size="small"
                                                                onClick={() => void patchCompetitor(c._id, { status: 'candidate' }).then(load)}
                                                            >
                                                                {t('pricing.unblockUrl')}
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                size="small"
                                                                color="error"
                                                                onClick={() => void patchCompetitor(c._id, { status: 'blocked' }).then(load)}
                                                            >
                                                                {t('pricing.blockUrl')}
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="small"
                                                            color="error"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                setDeleteFor({
                                                                    id: c._id,
                                                                    name: c.name || '',
                                                                    url: c.url || '',
                                                                })
                                                            }
                                                        >
                                                            {t('pricing.deleteCompetitor')}
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
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddFor(null)}>{t('common.cancel')}</Button>
                    <Button variant="contained" disabled={busy} onClick={() => void handleAdd()}>
                        {t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={discoverFor != null} onClose={() => !busy && setDiscoverFor(null)} fullWidth>
                <DialogTitle>{t('pricing.discovery')}</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
                        {t('pricing.discoveryHint')}
                    </Alert>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {discoverFor}
                    </Typography>
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                            gap: 1.5,
                        }}
                    >
                        {DISCOVERY_PLATFORM_ORDER.map((platform) => (
                            <TextField
                                key={platform}
                                type="number"
                                size="small"
                                label={t(`pricing.platforms.${platform}`)}
                                value={discoveryLimits[platform]}
                                disabled={busy}
                                onChange={(e) => {
                                    const n = Number(e.target.value);
                                    const next = Number.isFinite(n)
                                        ? Math.max(0, Math.min(DISCOVERY_LIMIT_MAX, Math.trunc(n)))
                                        : 0;
                                    setDiscoveryLimits((current) => ({ ...current, [platform]: next }));
                                }}
                                slotProps={{ htmlInput: { min: 0, max: DISCOVERY_LIMIT_MAX, step: 1 } }}
                            />
                        ))}
                    </Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
                        {t('pricing.discoverySearches')}: {discoverySearches} · $
                        {(discoverySearches * DISCOVERY_SEARCH_USD).toFixed(2)}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDiscoverFor(null)} disabled={busy}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        disabled={busy || discoverySearches === 0}
                        onClick={() => void runDiscovery()}
                    >
                        {t('pricing.discovery')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={editFor != null} onClose={() => setEditFor(null)} fullWidth>
                <DialogTitle>{t('pricing.editCompetitor')}</DialogTitle>
                <DialogContent>
                    <TextField
                        sx={{ mt: 1 }}
                        fullWidth
                        label={t('pricing.competitorName')}
                        value={editFor?.name || ''}
                        onChange={(e) => setEditFor((s) => (s ? { ...s, name: e.target.value } : s))}
                    />
                    <TextField
                        sx={{ mt: 2 }}
                        fullWidth
                        label="URL"
                        value={editFor?.url || ''}
                        onChange={(e) => setEditFor((s) => (s ? { ...s, url: e.target.value } : s))}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditFor(null)}>{t('common.cancel')}</Button>
                    <Button
                        variant="contained"
                        disabled={busy || !editFor?.url.trim()}
                        onClick={() => {
                            if (!editFor) return;
                            setBusy(true);
                            void patchCompetitor(editFor.id, { name: editFor.name, url: editFor.url })
                                .then(async (res) => {
                                    if (!res.success) throw new Error(res.message);
                                    setEditFor(null);
                                    await load();
                                })
                                .catch((e) => notify(e instanceof Error ? e.message : t('pricing.saveError'), 'error'))
                                .finally(() => setBusy(false));
                        }}
                    >
                        {t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={moveFor != null} onClose={() => setMoveFor(null)} fullWidth>
                <DialogTitle>{t('pricing.moveCandidate')}</DialogTitle>
                <DialogContent>
                    <TextField
                        sx={{ mt: 1 }}
                        select
                        fullWidth
                        label={t('pricing.moveTo')}
                        value={moveFor?.to || ''}
                        onChange={(e) => setMoveFor((s) => (s ? { ...s, to: e.target.value } : s))}
                    >
                        {clusters
                            .filter((cl) => cl.cluster !== moveFor?.from)
                            .map((cl) => (
                                <MenuItem key={cl.cluster} value={cl.cluster}>
                                    {cl.cluster}
                                </MenuItem>
                            ))}
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setMoveFor(null)}>{t('common.cancel')}</Button>
                    <Button
                        variant="contained"
                        disabled={busy || !moveFor?.to}
                        onClick={() => {
                            if (!moveFor?.to) return;
                            setBusy(true);
                            void patchCompetitor(moveFor.id, { cluster: moveFor.to })
                                .then(async (res) => {
                                    if (!res.success) throw new Error(res.message);
                                    setMoveFor(null);
                                    await load();
                                })
                                .catch((e) => notify(e instanceof Error ? e.message : t('pricing.saveError'), 'error'))
                                .finally(() => setBusy(false));
                        }}
                    >
                        {t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteFor != null} onClose={() => !busy && setDeleteFor(null)} fullWidth>
                <DialogTitle>{t('pricing.deleteCompetitorTitle')}</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mt: 1, mb: 2 }}>
                        {t('pricing.deleteCompetitorHint')}
                    </Alert>
                    <Typography variant="body2" fontWeight={600}>
                        {deleteFor?.name || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                        {deleteFor?.url}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteFor(null)} disabled={busy}>
                        {t('common.cancel')}
                    </Button>
                    <Button color="error" variant="contained" disabled={busy} onClick={() => void confirmDelete()}>
                        {t('pricing.deleteCompetitor')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

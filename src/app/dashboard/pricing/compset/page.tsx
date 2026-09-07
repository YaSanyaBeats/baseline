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
import { useTranslation } from '@/i18n/useTranslation';
import { usePricingNotify } from '@/components/pricing/usePricingNotify';
import { PERIOD_IDS, defaultPeriodForToday, type PeriodId } from '@/lib/pricing/periods';
import {
    addCompetitors,
    enableApify,
    fetchApifyStatus,
    fetchCompetitors,
    patchCompetitor,
    runApify,
    stopApify,
} from '@/lib/pricing/client';

export default function CompsetPage() {
    const { t } = useTranslation();
    const notify = usePricingNotify();
    const [loading, setLoading] = useState(true);
    const [clusters, setClusters] = useState<any[]>([]);
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [apify, setApify] = useState<any>(null);
    const [addFor, setAddFor] = useState<number | null>(null);
    const [urls, setUrls] = useState('');
    const [period, setPeriod] = useState<PeriodId>(defaultPeriodForToday());
    const [busy, setBusy] = useState(false);

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
        const list = urls.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
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

    const scrape = async (id: string, platform: string) => {
        if (!apify?.tokenConfigured) {
            notify(t('pricing.apifyNoToken'), 'warning');
            return;
        }
        setBusy(true);
        try {
            const res = await runApify(id, period);
            if (!res.success) throw new Error(res.message);
            notify(`${t('pricing.apifyDone')} $${Number(res.data?.costUsd || 0).toFixed(3)}`, 'success');
            await load();
        } catch (e) {
            notify(e instanceof Error ? e.message : t('pricing.saveError'), 'error');
        } finally {
            setBusy(false);
        }
        void platform;
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
                </Stack>
                {!apify?.tokenConfigured && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                        {t('pricing.apifyNoToken')}
                    </Alert>
                )}
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
                                <TableRow key={cl.cluster} hover sx={{ cursor: 'pointer' }} onClick={() => setOpen((s) => ({ ...s, [cl.cluster]: !s[cl.cluster] }))}>
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
                                            color={cl.coverage >= 0.7 ? 'success' : cl.coverage > 0 ? 'warning' : 'default'}
                                            label={`${cl.covered}/${cl.objects}`}
                                        />
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell colSpan={4} sx={{ py: 0, border: 0 }}>
                                        <Collapse in={Boolean(open[cl.cluster])} unmountOnExit>
                                            <Box sx={{ p: 2 }}>
                                                {cl.rooms.map((room: any) => (
                                                    <Paper key={room.roomId} variant="outlined" sx={{ p: 2, mb: 1 }}>
                                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                            <Typography fontWeight={600}>
                                                                {room.name} #{room.roomId}
                                                            </Typography>
                                                            <Button size="small" onClick={() => setAddFor(room.roomId)}>
                                                                {t('pricing.addCompetitor')}
                                                            </Button>
                                                        </Stack>
                                                        {room.competitors.map((c: any) => (
                                                            <Stack key={c._id} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mt: 1 }}>
                                                                <Chip size="small" label={t(`pricing.platforms.${c.platform}`)} />
                                                                <Typography variant="body2" sx={{ flex: 1 }}>
                                                                    {c.name} · {t(`pricing.competitorStatus.${c.status}`)}
                                                                    {c.lastPrice != null ? ` · ${Math.round(c.lastPrice)} ฿` : ''}
                                                                </Typography>
                                                                <Button size="small" href={c.url} target="_blank" rel="noreferrer">
                                                                    URL
                                                                </Button>
                                                                <Button size="small" disabled={busy || !apify?.tokenConfigured} onClick={() => void scrape(c._id, c.platform)}>
                                                                    {t('pricing.scrape')}
                                                                </Button>
                                                                <Button size="small" color="error" onClick={() => void patchCompetitor(c._id, { status: 'blocked' }).then(load)}>
                                                                    {t('common.delete')}
                                                                </Button>
                                                            </Stack>
                                                        ))}
                                                        {!room.competitors.length && (
                                                            <Typography variant="caption" color="text.secondary">
                                                                {t('pricing.noCompetitors')}
                                                            </Typography>
                                                        )}
                                                    </Paper>
                                                ))}
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
        </Stack>
    );
}

'use client';

import { useEffect, useState } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Paper,
    Slider,
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
import { useTranslation } from '@/i18n/useTranslation';
import { usePricingNotify } from '@/components/pricing/usePricingNotify';
import { fetchDemand, savePeriodRpi, saveTarget } from '@/lib/pricing/client';

const RPI_MARKS = [
    { value: 0, label: '0' },
    { value: 0.5, label: '0.5' },
    { value: 1, label: '1' },
];

function formatRpi(n: number) {
    return Number(n).toFixed(2);
}

export default function DemandPage() {
    const { t } = useTranslation();
    const notify = usePricingNotify();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<any[]>([]);

    const load = async () => {
        setLoading(true);
        try {
            const data = await fetchDemand();
            setRows(
                (data.byPeriod || []).map((row: { rpi: number }) => ({
                    ...row,
                    rpiSaved: Number(row.rpi),
                })),
            );
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
                    {t('pricing.rpiCurve')}
                </Typography>
                <BarChart
                    height={280}
                    xAxis={[{ scaleType: 'band', data: rows.map((r) => r.period) }]}
                    yAxis={[{ min: 0, max: 1 }]}
                    series={[
                        {
                            data: rows.map((r) => r.rpi),
                            label: t('pricing.rpi'),
                            color: '#2563eb',
                            valueFormatter: (v) => (v == null ? '' : formatRpi(v)),
                            barLabel: (item) => (item.value == null ? '' : formatRpi(item.value)),
                        },
                    ]}
                />
            </Paper>
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('pricing.period')}</TableCell>
                            <TableCell>{t('pricing.regime')}</TableCell>
                            <TableCell>{t('pricing.rpi')}</TableCell>
                            <TableCell>{t('pricing.occNorm')}</TableCell>
                            <TableCell>{t('pricing.occTarget')}</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => {
                            const delta = Math.round((Number(row.rpi) - Number(row.rpiSaved)) * 100) / 100;
                            return (
                                <TableRow key={row.period}>
                                    <TableCell>
                                        {row.period}
                                        <Typography variant="caption" display="block" color="text.secondary">
                                            {row.dates}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip size="small" label={t(`pricing.regimeLabels.${row.regime}`)} />
                                    </TableCell>
                                    <TableCell sx={{ minWidth: 280 }}>
                                        <Stack direction="row" spacing={1.5} alignItems="center">
                                            <Box sx={{ flex: 1, px: 1, pt: 1 }}>
                                                <Slider
                                                    value={Number(row.rpi)}
                                                    min={0}
                                                    max={1}
                                                    step={0.01}
                                                    marks={RPI_MARKS}
                                                    valueLabelDisplay="auto"
                                                    valueLabelFormat={formatRpi}
                                                    onChange={(_, v) =>
                                                        setRows((prev) =>
                                                            prev.map((r) =>
                                                                r.period === row.period ? { ...r, rpi: v as number } : r,
                                                            ),
                                                        )
                                                    }
                                                    onChangeCommitted={async (_, v) => {
                                                        const next = v as number;
                                                        await savePeriodRpi(row.period, next);
                                                        setRows((prev) =>
                                                            prev.map((r) =>
                                                                r.period === row.period
                                                                    ? { ...r, rpi: next, rpiSaved: next }
                                                                    : r,
                                                            ),
                                                        );
                                                        notify(t('common.save'), 'success');
                                                    }}
                                                />
                                            </Box>
                                            <Typography
                                                sx={{
                                                    width: 44,
                                                    fontWeight: 700,
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}
                                            >
                                                {formatRpi(row.rpi)}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                sx={{ width: 48, fontVariantNumeric: 'tabular-nums' }}
                                                color={
                                                    delta === 0
                                                        ? 'text.secondary'
                                                        : delta > 0
                                                          ? 'success.main'
                                                          : 'error.main'
                                                }
                                            >
                                                {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${formatRpi(delta)}`}
                                            </Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>{Math.round(row.occNorm)}%</TableCell>
                                    <TableCell>
                                        <TextField
                                            size="small"
                                            type="number"
                                            value={row.occTarget}
                                            onChange={(e) =>
                                                setRows((prev) =>
                                                    prev.map((r) =>
                                                        r.period === row.period
                                                            ? { ...r, occTarget: Number(e.target.value) }
                                                            : r,
                                                    ),
                                                )
                                            }
                                            sx={{ width: 90 }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            size="small"
                                            onClick={() =>
                                                void saveTarget(row.period, row.occTarget).then(() =>
                                                    notify(t('common.save'), 'success'),
                                                )
                                            }
                                        >
                                            {t('common.save')}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary">
                {t('pricing.normVsTargetHint')}
            </Typography>
        </Stack>
    );
}

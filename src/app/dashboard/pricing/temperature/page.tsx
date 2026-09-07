'use client';

import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Paper, Slider, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from '@/i18n/useTranslation';
import { usePricingNotify } from '@/components/pricing/usePricingNotify';
import { DEFAULT_TEMPERATURE, type ChannelSettings, type TemperatureSettings } from '@/lib/pricing/types';
import { fetchTemperature, saveTemperature } from '@/lib/pricing/client';

function normalizeTemperature(raw: Partial<TemperatureSettings> | null | undefined): TemperatureSettings {
    const src = raw || {};
    const pick = (key: keyof TemperatureSettings) => {
        const n = Number(src[key]);
        return Number.isFinite(n) ? n : DEFAULT_TEMPERATURE[key];
    };
    return {
        g: pick('g'),
        rH: pick('rH'),
        rS: pick('rS'),
        rL: pick('rL'),
        comp: pick('comp'),
        lm: pick('lm'),
        pace: pick('pace'),
        ceil: pick('ceil'),
        shoulder: pick('shoulder'),
    };
}

function TempSlider({
    label,
    hint,
    value,
    min,
    max,
    onChange,
}: {
    label: string;
    hint: string;
    value: number;
    min: number;
    max: number;
    onChange: (v: number) => void;
}) {
    return (
        <Box sx={{ mb: 2 }}>
            <Typography variant="body2">
                {label}
                <Typography component="span" variant="caption" color="text.secondary" display="block">
                    {hint}
                </Typography>
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
                <Slider
                    value={value}
                    min={min}
                    max={max}
                    step={1}
                    onChange={(_, v) => onChange(v as number)}
                />
                <Typography sx={{ width: 48, textAlign: 'right' }}>{value}</Typography>
            </Stack>
        </Box>
    );
}

export default function TemperaturePage() {
    const { t } = useTranslation();
    const notify = usePricingNotify();
    const [loading, setLoading] = useState(true);
    const [temp, setTemp] = useState<TemperatureSettings>(DEFAULT_TEMPERATURE);
    const [channels, setChannels] = useState<ChannelSettings | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchTemperature()
            .then((d) => {
                if (cancelled) return;
                setTemp(normalizeTemperature(d.temperature));
                setChannels(d.channels);
            })
            .catch(() => {
                if (!cancelled) notify(t('pricing.loadError'), 'error');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // Load once on mount. `t` is a new function every render and would reset sliders.
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
            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                    {t('pricing.tempGlobal')}
                </Typography>
                <TempSlider label={t('pricing.tempAll')} hint={t('pricing.tempAllHint')} value={temp.g} min={-30} max={30} onChange={(g) => setTemp({ ...temp, g })} />
                <TempSlider label={t('pricing.tempHigh')} hint="" value={temp.rH} min={-30} max={30} onChange={(rH) => setTemp({ ...temp, rH })} />
                <TempSlider label={t('pricing.tempShoulder')} hint="" value={temp.rS} min={-30} max={30} onChange={(rS) => setTemp({ ...temp, rS })} />
                <TempSlider label={t('pricing.tempLow')} hint="" value={temp.rL} min={-30} max={30} onChange={(rL) => setTemp({ ...temp, rL })} />
            </Paper>
            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                    {t('pricing.tempFactors')}
                </Typography>
                <TempSlider label={t('pricing.tempComp')} hint={t('pricing.tempCompHint')} value={temp.comp} min={0} max={100} onChange={(comp) => setTemp({ ...temp, comp })} />
                <TempSlider label={t('pricing.tempLm')} hint={t('pricing.tempLmHint')} value={temp.lm} min={0} max={20} onChange={(lm) => setTemp({ ...temp, lm })} />
                <TempSlider label={t('pricing.tempPace')} hint="" value={temp.pace} min={0} max={100} onChange={(pace) => setTemp({ ...temp, pace })} />
                <TempSlider label={t('pricing.tempCeil')} hint="" value={temp.ceil} min={80} max={115} onChange={(ceil) => setTemp({ ...temp, ceil })} />
                <TempSlider label={t('pricing.tempShoulderGuard')} hint="" value={temp.shoulder} min={0} max={100} onChange={(shoulder) => setTemp({ ...temp, shoulder })} />
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button onClick={() => setTemp(DEFAULT_TEMPERATURE)}>{t('pricing.reset')}</Button>
                    <Button
                        variant="contained"
                        onClick={async () => {
                            await saveTemperature({ temperature: temp });
                            notify(t('common.save'), 'success');
                        }}
                    >
                        {t('common.save')}
                    </Button>
                </Stack>
            </Paper>
            {channels && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                        {t('pricing.channelDict')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('pricing.channelNote')}
                    </Typography>
                    <Stack direction="row" spacing={2} flexWrap="wrap">
                        {(Object.keys(channels.coefficients) as Array<keyof typeof channels.coefficients>).map((ch) => (
                            <TextField
                                key={ch}
                                size="small"
                                label={t(`pricing.channels.${ch}`)}
                                type="number"
                                value={channels.coefficients[ch]}
                                onChange={(e) =>
                                    setChannels({
                                        ...channels,
                                        coefficients: { ...channels.coefficients, [ch]: Number(e.target.value) },
                                    })
                                }
                                sx={{ width: 120 }}
                            />
                        ))}
                    </Stack>
                    <Button
                        sx={{ mt: 2 }}
                        variant="outlined"
                        onClick={async () => {
                            await saveTemperature({ channels });
                            notify(t('common.save'), 'success');
                        }}
                    >
                        {t('pricing.saveChannels')}
                    </Button>
                </Paper>
            )}
        </Stack>
    );
}

'use client';

import { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
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
import { useTranslation } from '@/i18n/useTranslation';
import { usePricingNotify } from '@/components/pricing/usePricingNotify';
import { fetchClusters, patchCluster } from '@/lib/pricing/client';

export default function ClustersPage() {
    const { t } = useTranslation();
    const notify = usePricingNotify();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [newName, setNewName] = useState('');
    const [rebuilding, setRebuilding] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            setData(await fetchClusters());
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

    if (loading || !data) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    const names: string[] = data.allNames || [];

    return (
        <Stack spacing={2}>
            <Paper sx={{ p: 2 }}>
                <Alert severity="info" sx={{ mb: 2 }}>
                    {t('pricing.rebuildFromMetaHint')}
                </Alert>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField size="small" label={t('pricing.newCluster')} value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <Button
                        variant="contained"
                        onClick={async () => {
                            if (!newName.trim()) return;
                            await patchCluster({ createCluster: newName.trim() });
                            setNewName('');
                            notify(t('pricing.clusterCreatedHint'), 'info');
                        }}
                    >
                        {t('pricing.addCluster')}
                    </Button>
                    <Button
                        variant="outlined"
                        disabled={rebuilding}
                        onClick={async () => {
                            setRebuilding(true);
                            try {
                                const res = await patchCluster({ rebuildFromMetadata: true });
                                await load();
                                notify(
                                    `${t('pricing.rebuildDone')}: ${res.data?.clusters?.length ?? 0} · ${res.data?.assigned ?? 0}`,
                                    'success',
                                );
                            } catch {
                                notify(t('pricing.saveError'), 'error');
                            } finally {
                                setRebuilding(false);
                            }
                        }}
                    >
                        {t('pricing.rebuildFromMeta')}
                    </Button>
                </Stack>
            </Paper>

            {data.unassigned?.length > 0 && (
                <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                        {t('pricing.needsOnboarding')}
                    </Typography>
                    {data.unassigned.map((room: any) => (
                        <Stack key={room.roomId} direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                            <Box sx={{ flex: 1 }}>
                                <Typography>
                                    {room.name} #{room.roomId}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {[
                                        room.district || '—',
                                        room.objectType === 'villa'
                                            ? t('dashboard.objectTypeVilla')
                                            : room.objectType === 'apartments'
                                              ? t('dashboard.objectTypeApartments')
                                              : '—',
                                        room.level === 'economy'
                                            ? t('dashboard.levelEconomy')
                                            : room.level === 'comfort'
                                              ? t('dashboard.levelComfort')
                                              : room.level === 'premium'
                                                ? t('dashboard.levelPremium')
                                                : room.level === 'lux'
                                                  ? t('dashboard.levelLux')
                                                  : '—',
                                        room.bedrooms == null ? '—' : room.bedrooms === 0 ? t('pricing.studio') : String(room.bedrooms),
                                    ].join(' · ')}
                                    {' · '}
                                    {t('pricing.missingMeta')}
                                </Typography>
                            </Box>
                            <FormControl size="small" sx={{ minWidth: 220 }}>
                                <InputLabel>{t('pricing.cluster')}</InputLabel>
                                <Select
                                    label={t('pricing.cluster')}
                                    value=""
                                    onChange={async (e) => {
                                        await patchCluster({ roomId: room.roomId, cluster: e.target.value });
                                        await load();
                                    }}
                                >
                                    {names.map((n) => (
                                        <MenuItem key={n} value={n}>
                                            {n}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                    ))}
                </Paper>
            )}

            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('pricing.cluster')}</TableCell>
                            <TableCell>{t('pricing.objects')}</TableCell>
                            <TableCell>{t('pricing.floor')}</TableCell>
                            <TableCell>{t('pricing.rooms')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.clusters.map((cl: any) => (
                            <TableRow key={cl.name}>
                                <TableCell>{cl.name}</TableCell>
                                <TableCell>{cl.units}</TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="number"
                                        defaultValue={cl.floor || ''}
                                        onBlur={async (e) => {
                                            await patchCluster({ cluster: cl.name, floor: Number(e.target.value) || 0 });
                                        }}
                                        sx={{ width: 120 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    {cl.rooms.map((room: any) => (
                                        <Stack key={room.roomId} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                            <Typography variant="body2" sx={{ flex: 1 }}>
                                                {room.name}
                                            </Typography>
                                            <FormControl size="small" sx={{ minWidth: 200 }}>
                                                <Select
                                                    value={room.cluster}
                                                    onChange={async (e) => {
                                                        await patchCluster({ roomId: room.roomId, cluster: e.target.value });
                                                        await load();
                                                    }}
                                                >
                                                    {names.map((n) => (
                                                        <MenuItem key={n} value={n}>
                                                            {n}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </Stack>
                                    ))}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Stack>
    );
}

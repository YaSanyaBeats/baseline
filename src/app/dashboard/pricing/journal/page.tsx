'use client';

import { useEffect, useState } from 'react';
import {
    Box,
    CircularProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import { useTranslation } from '@/i18n/useTranslation';
import { usePricingNotify } from '@/components/pricing/usePricingNotify';
import { fetchJournal } from '@/lib/pricing/client';

export default function PricingJournalPage() {
    const { t } = useTranslation();
    const notify = usePricingNotify();
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<any[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchJournal()
            .then((data) => {
                if (!cancelled) setItems(data.items || []);
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
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('pricing.when')}</TableCell>
                            <TableCell>{t('pricing.who')}</TableCell>
                            <TableCell>{t('pricing.journalType')}</TableCell>
                            <TableCell>{t('pricing.target')}</TableCell>
                            <TableCell>{t('pricing.detail')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.map((row, idx) => (
                            <TableRow key={row._id || idx}>
                                <TableCell>
                                    {row.ts ? new Date(row.ts).toLocaleString() : '—'}
                                </TableCell>
                                <TableCell>{row.userName}</TableCell>
                                <TableCell>{row.type}</TableCell>
                                <TableCell>{row.target}</TableCell>
                                <TableCell>
                                    <Typography variant="body2">{row.detail}</Typography>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Stack>
    );
}

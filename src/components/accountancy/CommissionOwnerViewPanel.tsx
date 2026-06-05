'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';
import { loadCommissionOwnerViewPayload } from '@/lib/commissionOwnerViewLoader';
import type { CommissionOwnerViewStoredPayload } from '@/lib/commissionOwnerView';
import CommissionOwnerViewReport from '@/components/accountancy/CommissionOwnerViewReport';

export type CommissionOwnerViewPanelProps = {
    ownerId: string;
    monthKey: string;
    backLink?: { href: string; label: string } | null;
    title?: string;
};

export default function CommissionOwnerViewPanel({
    ownerId,
    monthKey,
    backLink,
    title,
}: CommissionOwnerViewPanelProps) {
    const { t, language } = useTranslation();
    const { objects } = useObjects();

    const [payload, setPayload] = useState<CommissionOwnerViewStoredPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);

    const locale = language === 'en' ? 'en-US' : 'ru-RU';
    const hasParams = Boolean(ownerId && monthKey);

    useEffect(() => {
        if (!hasParams) {
            setPayload(null);
            setLoadFailed(false);
            setLoading(false);
            return;
        }

        let cancelled = false;

        const run = async () => {
            setLoading(true);
            setLoadFailed(false);
            setPayload(null);
            try {
                const next = await loadCommissionOwnerViewPayload({
                    ownerId,
                    monthKey,
                    locale,
                    objects,
                });
                if (cancelled) return;
                if (!next) {
                    setLoadFailed(true);
                    return;
                }
                setPayload(next);
            } catch (err) {
                console.error('Owner view load error:', err);
                if (!cancelled) setLoadFailed(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [hasParams, ownerId, monthKey, locale, objects]);

    const displayLocale = useMemo(
        () => (payload?.language === 'en-US' ? 'en-US' : locale),
        [payload?.language, locale]
    );

    if (!hasParams) {
        return (
            <Box>
                {backLink && (
                    <Box sx={{ mb: 2 }}>
                        <Link href={backLink.href}>
                            <Button variant="text" startIcon={<ArrowBackIcon />}>
                                {backLink.label}
                            </Button>
                        </Link>
                    </Box>
                )}
                <Alert severity="info">{t('accountancy.commission.ownerViewNoData')}</Alert>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box>
                {backLink && (
                    <Box sx={{ mb: 2 }}>
                        <Link href={backLink.href}>
                            <Button variant="text" startIcon={<ArrowBackIcon />}>
                                {backLink.label}
                            </Button>
                        </Link>
                    </Box>
                )}
                <Stack direction="row" spacing={2} alignItems="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                    <Typography color="text.secondary">
                        {t('accountancy.commission.ownerViewLoading')}
                    </Typography>
                </Stack>
            </Box>
        );
    }

    if (loadFailed || !payload) {
        return (
            <Box>
                {backLink && (
                    <Box sx={{ mb: 2 }}>
                        <Link href={backLink.href}>
                            <Button variant="text" startIcon={<ArrowBackIcon />}>
                                {backLink.label}
                            </Button>
                        </Link>
                    </Box>
                )}
                <Alert severity="warning">{t('accountancy.commission.ownerViewLoadError')}</Alert>
            </Box>
        );
    }

    return (
        <Box>
            {backLink && (
                <Box sx={{ mb: 2 }}>
                    <Link href={backLink.href}>
                        <Button variant="text" startIcon={<ArrowBackIcon />}>
                            {backLink.label}
                        </Button>
                    </Link>
                </Box>
            )}
            <CommissionOwnerViewReport
                payload={payload}
                displayLocale={displayLocale}
                t={t}
                title={title}
            />
        </Box>
    );
}

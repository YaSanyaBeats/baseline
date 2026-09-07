'use client';

import { Alert, Stack, Typography } from '@mui/material';
import PricingTabs from '@/components/pricing/PricingTabs';
import { useTranslation } from '@/i18n/useTranslation';

export default function PricingLayout({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation();
    return (
        <Stack spacing={2}>
            <Typography variant="h5">{t('pricing.title')}</Typography>
            <Alert severity="info">{t('pricing.readOnlyBanner')}</Alert>
            <PricingTabs />
            {children}
        </Stack>
    );
}

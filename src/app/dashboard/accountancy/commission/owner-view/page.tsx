'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import { useTranslation } from '@/i18n/useTranslation';
import { useUser } from '@/providers/UserProvider';
import CommissionOwnerViewPanel from '@/components/accountancy/CommissionOwnerViewPanel';

function OwnerViewPageContent() {
    const searchParams = useSearchParams();
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();

    const ownerId = searchParams.get('ownerId') ?? '';
    const monthKey = searchParams.get('month') ?? '';
    const hasAccess = isAdmin || isAccountant;

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.commission.ownerViewTitle')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <CommissionOwnerViewPanel
            ownerId={ownerId}
            monthKey={monthKey}
            backLink={{
                href: '/dashboard/accountancy/commission',
                label: t('accountancy.commission.ownerViewBackToCommission'),
            }}
        />
    );
}

export default function OwnerViewPage() {
    return (
        <Suspense
            fallback={
                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                    <CircularProgress />
                </Box>
            }
        >
            <OwnerViewPageContent />
        </Suspense>
    );
}

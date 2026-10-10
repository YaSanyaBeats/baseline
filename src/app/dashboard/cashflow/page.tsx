'use client';

import { Box, Typography } from '@mui/material';
import CashflowLedgerView from '@/components/accountancy/CashflowLedgerView';
import { useTranslation } from '@/i18n/useTranslation';
import { useUser } from '@/providers/UserProvider';

export default function Page() {
    const { t } = useTranslation();
    const { user, isLoading } = useUser();
    const userId = user?._id?.toString?.() ?? '';

    if (!userId) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.myCashflowTitle')}</Typography>
                <Typography sx={{ mt: 2 }} color="text.secondary">
                    {isLoading ? t('accountancy.loading') : t('accountancy.noAccess')}
                </Typography>
            </Box>
        );
    }

    return <CashflowLedgerView userId={userId} variant="self" />;
}

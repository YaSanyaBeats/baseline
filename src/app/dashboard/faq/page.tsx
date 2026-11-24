'use client';

import { Alert, Box, Typography } from '@mui/material';
import { useTranslation } from '@/i18n/useTranslation';
import { useUser } from '@/providers/UserProvider';
import OwnerFaq from '@/components/faq/OwnerFaq';

export default function FaqPage() {
    const { t } = useTranslation();
    const { isOwner } = useUser();

    if (!isOwner) {
        return (
            <Box>
                <Typography variant="h4">{t('faqPage.title')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('faqPage.noAccess')}
                </Alert>
            </Box>
        );
    }

    return <OwnerFaq />;
}

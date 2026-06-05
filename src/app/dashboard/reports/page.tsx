'use client';

import { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Typography,
} from '@mui/material';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/i18n/useTranslation';
import { useUser } from '@/providers/UserProvider';
import { isAdminImpersonatingOwner } from '@/lib/impersonationAccess';
import { useObjects } from '@/providers/ObjectsProvider';
import { filterObjectsForOwner } from '@/lib/ownerObjectsFilter';
import { buildMonthOptions } from '@/lib/monthOptions';
import CommissionOwnerViewPanel from '@/components/accountancy/CommissionOwnerViewPanel';

export default function ReportsPage() {
    const { t } = useTranslation();
    const { data: session } = useSession();
    const { user } = useUser();
    const { objects } = useObjects();
    const [selectedMonth, setSelectedMonth] = useState('');

    const canAccess = isAdminImpersonatingOwner(session);
    const ownerId = user?._id ?? '';

    const ownerObjects = useMemo(() => {
        if (!user) return [];
        return filterObjectsForOwner(objects, user.objects ?? []);
    }, [user, objects]);

    const monthOptions = useMemo(() => buildMonthOptions(t), [t]);

    if (!canAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('menu.reports')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('reports.testModeOnly')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('menu.reports')}
            </Typography>

            <Paper sx={{ p: 2, mb: 3 }}>
                <FormControl sx={{ minWidth: 240 }} size="small">
                    <InputLabel>{t('accountancy.selectMonth')}</InputLabel>
                    <Select
                        label={t('accountancy.selectMonth')}
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value as string)}
                    >
                        <MenuItem value="">
                            <em>{t('accountancy.commission.selectMonth')}</em>
                        </MenuItem>
                        {monthOptions.map((o) => (
                            <MenuItem key={o.value} value={o.value}>
                                {o.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {ownerObjects.length === 0 && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {t('accountancy.commission.noOwnerObjects')}
                    </Alert>
                )}
            </Paper>

            {selectedMonth && ownerId && ownerObjects.length > 0 && (
                <CommissionOwnerViewPanel
                    ownerId={ownerId}
                    monthKey={selectedMonth}
                    title={t('menu.reports')}
                />
            )}
        </Box>
    );
}

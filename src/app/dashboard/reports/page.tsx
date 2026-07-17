'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    CircularProgress,
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
import { canAccessReports } from '@/lib/impersonationAccess';
import { useObjects } from '@/providers/ObjectsProvider';
import { filterObjectsForOwner } from '@/lib/ownerObjectsFilter';
import { buildMonthOptionsFromKeys } from '@/lib/monthOptions';
import { getClosedPeriods } from '@/lib/accountancyClosedMonthsClient';
import { getClosedReportMonthsForOwnerObjects } from '@/lib/accountancyClosedMonth';
import CommissionOwnerViewPanel from '@/components/accountancy/CommissionOwnerViewPanel';

export default function ReportsPage() {
    const { t } = useTranslation();
    const { data: session } = useSession();
    const { user, isOwner } = useUser();
    const { objects } = useObjects();
    const [selectedMonth, setSelectedMonth] = useState('');
    const [closedPeriodsLoading, setClosedPeriodsLoading] = useState(false);
    const [closedMonthKeys, setClosedMonthKeys] = useState<string[]>([]);

    const canAccess = canAccessReports(session, { isOwner });
    const ownerId = user?._id ?? '';

    const ownerObjects = useMemo(() => {
        if (!user) return [];
        return filterObjectsForOwner(objects, user.objects ?? []);
    }, [user, objects]);

    useEffect(() => {
        if (!canAccess) return;

        let cancelled = false;

        const loadClosedMonths = async () => {
            setClosedPeriodsLoading(true);
            try {
                const data = await getClosedPeriods();
                if (cancelled) return;
                setClosedMonthKeys(getClosedReportMonthsForOwnerObjects(data, ownerObjects));
            } catch (err) {
                console.error('Failed to load closed months for reports:', err);
                if (!cancelled) setClosedMonthKeys([]);
            } finally {
                if (!cancelled) setClosedPeriodsLoading(false);
            }
        };

        void loadClosedMonths();
        return () => {
            cancelled = true;
        };
    }, [canAccess, ownerObjects]);

    const monthOptions = useMemo(
        () => buildMonthOptionsFromKeys(t, closedMonthKeys),
        [t, closedMonthKeys],
    );

    useEffect(() => {
        if (selectedMonth && !closedMonthKeys.includes(selectedMonth)) {
            setSelectedMonth('');
        }
    }, [selectedMonth, closedMonthKeys]);

    if (!canAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('menu.reports')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('reports.noAccess')}
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
                <FormControl sx={{ minWidth: 240 }} size="small" disabled={closedPeriodsLoading}>
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
                {closedPeriodsLoading && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                        <CircularProgress size={20} />
                        <Typography variant="body2" color="text.secondary">
                            {t('reports.loadingClosedMonths')}
                        </Typography>
                    </Box>
                )}
                {!closedPeriodsLoading && monthOptions.length === 0 && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {t('reports.noClosedMonths')}
                    </Alert>
                )}
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

'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/i18n/useTranslation';
import { useUser } from '@/providers/UserProvider';
import { useObjects } from '@/providers/ObjectsProvider';
import { apiClient, getApiUrl } from '@/lib/api-client';
import { isAdminImpersonatingOwner } from '@/lib/impersonationAccess';
import OwnerBalanceDialog, { type OwnerBalanceLedgerRow } from '@/components/accountancy/OwnerBalanceDialog';
import type { Expense, Income } from '@/lib/types';

type StatisticsPayload = {
    transactions: OwnerBalanceLedgerRow[];
    incomes: Income[];
    expenses: Expense[];
};

export default function StatisticsPage() {
    const { t } = useTranslation();
    const { data: session } = useSession();
    const { user } = useUser();
    const { objects } = useObjects();
    const [data, setData] = useState<StatisticsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const canAccess =
        (user?.role === 'owner' && user?.accountType === 'premium') ||
        isAdminImpersonatingOwner(session);

    useEffect(() => {
        if (!canAccess) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const response = await apiClient.get<StatisticsPayload>(getApiUrl('owner-statistics'));
                if (!cancelled) {
                    setData(response.data);
                    setError(false);
                }
            } catch (err) {
                console.error('Error loading owner statistics:', err);
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [canAccess]);

    if (!canAccess) {
        return <Alert severity="info">{t('statistics.noAccess')}</Alert>;
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return <Alert severity="error">{t('statistics.loadError')}</Alert>;
    }

    return (
        <OwnerBalanceDialog
            presentation="page"
            owner={user}
            transactions={data?.transactions ?? []}
            incomes={data?.incomes ?? []}
            expenses={data?.expenses ?? []}
            objects={objects}
            t={t}
        />
    );
}

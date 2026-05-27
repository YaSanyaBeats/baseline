'use client';

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
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalculateIcon from '@mui/icons-material/Calculate';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';
import { getUsers } from '@/lib/users';
import { filterObjectsForOwner } from '@/lib/ownerObjectsFilter';
import type { User } from '@/lib/types';

const COMMISSION_FILTERS_KEY = 'accountancy-commission-filters';

function loadCommissionFiltersPayload(): {
    selectedOwnerId: string;
    selectedMonth: string;
} | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(COMMISSION_FILTERS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            selectedOwnerId: String(parsed.selectedOwnerId ?? ''),
            selectedMonth: String(parsed.selectedMonth ?? ''),
        };
    } catch {
        return null;
    }
}

function saveCommissionFilters(state: { selectedOwnerId: string; selectedMonth: string }) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(COMMISSION_FILTERS_KEY, JSON.stringify(state));
    } catch {
        // ignore
    }
}

function ownerSelectLabel(owner: User): string {
    return (owner.name || owner.login || '').trim();
}

export default function Page() {
    const router = useRouter();
    const { t, language } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { objects } = useObjects();

    const [owners, setOwners] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const commissionFiltersLoadedRef = useRef(false);
    const [filtersHydrated, setFiltersHydrated] = useState(false);
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState<string>('');

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (commissionFiltersLoadedRef.current) return;
        const s = loadCommissionFiltersPayload();
        if (s) {
            setSelectedOwnerId(s.selectedOwnerId);
            setSelectedMonth(s.selectedMonth);
        }
        commissionFiltersLoadedRef.current = true;
        setFiltersHydrated(true);
    }, []);

    useEffect(() => {
        if (!filtersHydrated) return;
        saveCommissionFilters({ selectedOwnerId, selectedMonth });
    }, [filtersHydrated, selectedOwnerId, selectedMonth]);

    const selectedOwner = selectedOwnerId
        ? owners.find((o) => o._id === selectedOwnerId)
        : null;

    const ownerObjects = useMemo(() => {
        if (!selectedOwner) return [];
        return filterObjectsForOwner(objects, selectedOwner.objects ?? []);
    }, [selectedOwner, objects]);

    const ownersSorted = useMemo(() => {
        const locale = language === 'en' ? 'en' : 'ru';
        return [...owners].sort((a, b) =>
            ownerSelectLabel(a).localeCompare(ownerSelectLabel(b), locale, { sensitivity: 'base' })
        );
    }, [owners, language]);

    useEffect(() => {
        if (!hasAccess) return;

        const load = async () => {
            setLoading(true);
            try {
                const usersList = await getUsers();
                setOwners(usersList.filter((u) => u.role === 'owner'));
            } catch (err) {
                console.error('Error loading owners:', err);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [hasAccess]);

    const handleSubmit = () => {
        if (!selectedOwnerId || !selectedMonth || ownerObjects.length === 0) return;

        setSubmitting(true);
        const qs = new URLSearchParams({
            ownerId: selectedOwnerId,
            month: selectedMonth,
        });
        router.push(`/dashboard/accountancy/commission/owner-view?${qs.toString()}`);
    };

    const monthOptions = (() => {
        const options: { value: string; label: string }[] = [];
        const now = new Date();
        for (let i = 0; i < 24; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const value = `${y}-${String(m).padStart(2, '0')}`;
            const monthName = t(`accountancy.months.${m}`);
            options.push({ value, label: `${monthName} ${y}` });
        }
        return options;
    })();

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.commission.title')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('accountancy.commission.title')}
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                {t('accountancy.commission.description')}
            </Typography>

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    {t('accountancy.commission.params')}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap" useFlexGap>
                    <FormControl sx={{ minWidth: 240 }} size="small">
                        <InputLabel>{t('users.owner')}</InputLabel>
                        <Select
                            label={t('users.owner')}
                            value={selectedOwnerId}
                            onChange={(e) => setSelectedOwnerId(e.target.value as string)}
                        >
                            <MenuItem value="">
                                <em>{t('accountancy.commission.selectOwner')}</em>
                            </MenuItem>
                            {ownersSorted.map((owner) => (
                                <MenuItem key={owner._id} value={owner._id ?? ''}>
                                    {ownerSelectLabel(owner) || owner.login}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl sx={{ minWidth: 200 }} size="small">
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

                    <Button
                        variant="contained"
                        startIcon={
                            submitting ? (
                                <CircularProgress size={20} color="inherit" />
                            ) : (
                                <CalculateIcon />
                            )
                        }
                        onClick={handleSubmit}
                        disabled={
                            !selectedOwnerId ||
                            !selectedMonth ||
                            ownerObjects.length === 0 ||
                            submitting ||
                            loading
                        }
                    >
                        {t('accountancy.commission.calculate')}
                    </Button>
                </Stack>
                {selectedOwnerId && ownerObjects.length === 0 && !loading && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {t('accountancy.commission.noOwnerObjects')}
                    </Alert>
                )}
            </Paper>
        </Box>
    );
}

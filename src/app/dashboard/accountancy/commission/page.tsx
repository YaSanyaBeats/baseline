'use client';

import {
    Alert,
    Autocomplete,
    Box,
    Button,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
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
import { getInternalObjectRoomDisplayName } from '@/lib/internalObjectDisplay';
import { filterObjectsForOwner } from '@/lib/ownerObjectsFilter';
import type { Room, User } from '@/lib/types';

const COMMISSION_FILTERS_KEY = 'accountancy-commission-filters';

type CommissionReportVersion = 1 | 2;

function parseReportVersion(value: unknown): CommissionReportVersion {
    return Number(value) === 1 ? 1 : 2;
}

type CommissionSelection = 'room' | 'owner' | '';

type RoomChoice = {
    key: string;
    objectId: number;
    roomName: string;
    label: string;
    searchText: string;
};

function stableRoomName(room: Pick<Room, 'id' | 'name'>): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id ?? ''}`;
}

function loadCommissionFiltersPayload(): {
    selection: CommissionSelection;
    selectedOwnerId: string;
    selectedRoomKey: string;
    selectedMonth: string;
    reportVersion: CommissionReportVersion;
} | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(COMMISSION_FILTERS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const selectedOwnerId = String(parsed.selectedOwnerId ?? '');
        const selectedRoomKey = String(parsed.selectedRoomKey ?? '');
        const selection: CommissionSelection =
            parsed.selection === 'room' || parsed.selection === 'owner'
                ? parsed.selection
                : selectedOwnerId
                  ? 'owner'
                  : '';
        return {
            selection,
            selectedOwnerId: selection === 'owner' ? selectedOwnerId : '',
            selectedRoomKey: selection === 'room' ? selectedRoomKey : '',
            selectedMonth: String(parsed.selectedMonth ?? ''),
            reportVersion: parseReportVersion(parsed.reportVersion),
        };
    } catch {
        return null;
    }
}

function saveCommissionFilters(state: {
    selection: CommissionSelection;
    selectedOwnerId: string;
    selectedRoomKey: string;
    selectedMonth: string;
    reportVersion: CommissionReportVersion;
}) {
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
    const [selection, setSelection] = useState<CommissionSelection>('');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
    const [selectedRoomKey, setSelectedRoomKey] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState<string>('');
    const [reportVersion, setReportVersion] = useState<CommissionReportVersion>(2);

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (commissionFiltersLoadedRef.current) return;
        const s = loadCommissionFiltersPayload();
        if (s) {
            setSelection(s.selection);
            setSelectedOwnerId(s.selectedOwnerId);
            setSelectedRoomKey(s.selectedRoomKey);
            setSelectedMonth(s.selectedMonth);
            setReportVersion(s.reportVersion);
        }
        commissionFiltersLoadedRef.current = true;
        setFiltersHydrated(true);
    }, []);

    useEffect(() => {
        if (!filtersHydrated) return;
        saveCommissionFilters({
            selection,
            selectedOwnerId,
            selectedRoomKey,
            selectedMonth,
            reportVersion,
        });
    }, [filtersHydrated, selection, selectedOwnerId, selectedRoomKey, selectedMonth, reportVersion]);

    const roomOptions = useMemo(() => {
        const locale = language === 'en' ? 'en' : 'ru';
        const list: RoomChoice[] = [];
        for (const obj of objects) {
            const isInternalObject = obj.id < 0;
            for (const room of obj.roomTypes ?? []) {
                const roomName = stableRoomName(room);
                const roomPart = isInternalObject
                    ? getInternalObjectRoomDisplayName(room, language) || `Room ${room.id}`
                    : room.name || `Room ${room.id}`;
                list.push({
                    key: `${obj.id}::${roomName}`,
                    objectId: obj.id,
                    roomName,
                    label: `${obj.name} — ${roomPart}`,
                    searchText: `${obj.name} ${room.name || ''} ${room.nameEn || ''} ${room.id}`.trim(),
                });
            }
        }
        return list.sort((a, b) => a.label.localeCompare(b.label, locale, { sensitivity: 'base' }));
    }, [objects, language]);

    const selectedRoom = useMemo(
        () => (selection === 'room' ? roomOptions.find((room) => room.key === selectedRoomKey) ?? null : null),
        [selection, roomOptions, selectedRoomKey]
    );

    const ownersSorted = useMemo(() => {
        const locale = language === 'en' ? 'en' : 'ru';
        return [...owners].sort((a, b) =>
            ownerSelectLabel(a).localeCompare(ownerSelectLabel(b), locale, { sensitivity: 'base' })
        );
    }, [owners, language]);

    const matchedRoomOwners = useMemo(() => {
        if (!selectedRoom) return [];
        return ownersSorted.filter((owner) => {
            const assigned = filterObjectsForOwner(objects, owner.objects ?? []);
            return assigned.some(
                (obj) =>
                    obj.id === selectedRoom.objectId &&
                    obj.roomTypes.some((room) => stableRoomName(room) === selectedRoom.roomName)
            );
        });
    }, [selectedRoom, ownersSorted, objects]);

    const selectedOwner = useMemo(() => {
        if (selection === 'owner') {
            return selectedOwnerId ? owners.find((owner) => owner._id === selectedOwnerId) ?? null : null;
        }
        if (selection === 'room' && matchedRoomOwners.length === 1) return matchedRoomOwners[0];
        return null;
    }, [selection, selectedOwnerId, owners, matchedRoomOwners]);

    const ownerObjects = useMemo(() => {
        if (!selectedOwner) return [];
        return filterObjectsForOwner(objects, selectedOwner.objects ?? []);
    }, [selectedOwner, objects]);

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

    const handleSelectRoom = (room: RoomChoice | null) => {
        setSelectedRoomKey(room?.key ?? '');
        setSelectedOwnerId('');
        setSelection(room ? 'room' : '');
    };

    const handleSelectOwner = (owner: User | null) => {
        setSelectedOwnerId(owner?._id ?? '');
        setSelectedRoomKey('');
        setSelection(owner ? 'owner' : '');
    };

    const handleSubmit = () => {
        if (!selectedOwner?._id || !selectedMonth || ownerObjects.length === 0) return;

        setSubmitting(true);
        const qs = new URLSearchParams({
            ownerId: selectedOwner._id,
            month: selectedMonth,
            version: String(reportVersion),
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

            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ sm: 'center' }}
                justifyContent="space-between"
                sx={{ mb: 3 }}
            >
                <Typography variant="h4">{t('accountancy.commission.title')}</Typography>
                <Button
                    component={Link}
                    href="/dashboard/accountancy/commission/report-check"
                    variant="outlined"
                >
                    {t('accountancy.commission.reportCheck.button')}
                </Button>
            </Stack>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                {t('accountancy.commission.description')}
            </Typography>

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    {t('accountancy.commission.params')}
                </Typography>
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    flexWrap="wrap"
                    useFlexGap
                    alignItems={{ sm: 'center' }}
                >
                    <Autocomplete
                        size="small"
                        sx={{ minWidth: 280, flex: '1 1 280px' }}
                        options={roomOptions}
                        value={selectedRoom}
                        onChange={(_, room) => handleSelectRoom(room)}
                        getOptionLabel={(room) => room.label}
                        isOptionEqualToValue={(a, b) => a.key === b.key}
                        filterOptions={(options, state) => {
                            const query = state.inputValue.trim().toLowerCase();
                            if (!query) return options;
                            return options.filter((room) => room.searchText.toLowerCase().includes(query));
                        }}
                        noOptionsText={t('accountancy.commission.nothingFound')}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label={t('common.room')}
                                placeholder={t('accountancy.commission.selectRoom')}
                            />
                        )}
                    />

                    <Typography variant="body2" color="text.secondary" sx={{ px: { sm: 0.5 } }}>
                        {t('accountancy.commission.or')}
                    </Typography>

                    <Autocomplete
                        size="small"
                        sx={{ minWidth: 240, flex: '1 1 240px' }}
                        options={ownersSorted}
                        value={selection === 'owner' ? selectedOwner : null}
                        onChange={(_, owner) => handleSelectOwner(owner)}
                        getOptionLabel={(owner) => ownerSelectLabel(owner) || owner.login}
                        isOptionEqualToValue={(a, b) => a._id === b._id}
                        loading={loading}
                        noOptionsText={t('accountancy.commission.nothingFound')}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label={t('users.owner')}
                                placeholder={t('accountancy.commission.selectOwner')}
                            />
                        )}
                    />

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

                    <FormControl sx={{ minWidth: 140 }} size="small">
                        <InputLabel>{t('accountancy.commission.reportVersion')}</InputLabel>
                        <Select
                            label={t('accountancy.commission.reportVersion')}
                            value={reportVersion}
                            onChange={(e) =>
                                setReportVersion(parseReportVersion(e.target.value))
                            }
                        >
                            <MenuItem value={1}>{t('accountancy.commission.reportVersionV1')}</MenuItem>
                            <MenuItem value={2}>{t('accountancy.commission.reportVersionV2')}</MenuItem>
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
                            !selectedOwner?._id ||
                            !selectedMonth ||
                            ownerObjects.length === 0 ||
                            submitting ||
                            loading
                        }
                    >
                        {t('accountancy.commission.calculate')}
                    </Button>
                </Stack>
                {selection === 'room' && selectedOwner && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        {t('users.owner')}: {ownerSelectLabel(selectedOwner) || selectedOwner.login}
                    </Typography>
                )}
                {selection === 'owner' && selectedOwnerId && ownerObjects.length === 0 && !loading && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {t('accountancy.commission.noOwnerObjects')}
                    </Alert>
                )}
                {selection === 'room' && selectedRoom && matchedRoomOwners.length === 0 && !loading && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {t('accountancy.commission.roomNoOwner')}
                    </Alert>
                )}
                {selection === 'room' && matchedRoomOwners.length > 1 && !loading && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {t('accountancy.commission.roomMultipleOwners')}{' '}
                        {matchedRoomOwners.map((owner) => ownerSelectLabel(owner) || owner.login).join(', ')}
                    </Alert>
                )}
            </Paper>
        </Box>
    );
}

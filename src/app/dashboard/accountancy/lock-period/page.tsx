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
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import RoomsMultiSelect from '@/components/objectsMultiSelect/RoomsMultiSelect';
import { useUser } from '@/providers/UserProvider';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useObjects } from '@/providers/ObjectsProvider';
import {
    buildClosedPeriodsCache,
    isLedgerPeriodClosed,
    type ClosedPeriodsData,
    type RoomPeriodInput,
} from '@/lib/accountancyClosedMonth';
import {
    closeReportRoomPeriods,
    getLockPeriodPageData,
    reopenReportRoomPeriods,
} from '@/lib/accountancyClosedMonthsClient';
import {
    ownerReportSnapshotKey,
    type SavedOwnerReportStatus,
} from '@/lib/ownerReportSnapshots';
import { stableAccountancyRoomLabel } from '@/lib/accountancyObjectGroups';
import { getApiErrorMessage } from '@/lib/axiosResponseMessage';
import type { Object as BedsObject, UserObject } from '@/lib/types';

const MATRIX_START = { year: 2025, month: 12 };

type MatrixRoomRow = {
    objectId: number;
    roomKey: string;
    label: string;
};

function buildAllRoomsUserObjects(objects: BedsObject[]): UserObject[] {
    const byId = new Map<number, Set<string>>();
    for (const obj of objects) {
        for (const room of obj.roomTypes) {
            const label = stableAccountancyRoomLabel(room);
            if (!byId.has(obj.id)) byId.set(obj.id, new Set());
            byId.get(obj.id)!.add(label);
        }
    }
    return Array.from(byId.entries()).map(([id, rooms]) => ({
        id,
        rooms: Array.from(rooms).sort((a, b) => a.localeCompare(b)),
    }));
}

function userObjectsToRoomPeriods(value: UserObject[]): RoomPeriodInput[] {
    const result: RoomPeriodInput[] = [];
    for (const obj of value) {
        for (const room of obj.rooms) {
            result.push({ objectId: obj.id, roomKey: String(room) });
        }
    }
    return result;
}

function buildMatrixMonths(): string[] {
    const result: string[] = [];
    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;
    let year = MATRIX_START.year;
    let month = MATRIX_START.month;

    while (year < endYear || (year === endYear && month <= endMonth)) {
        result.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }
    return result;
}

function buildMatrixRoomRows(objects: BedsObject[]): MatrixRoomRow[] {
    const rows: MatrixRoomRow[] = [];
    for (const obj of objects) {
        for (const room of obj.roomTypes) {
            const roomKey = stableAccountancyRoomLabel(room);
            rows.push({
                objectId: obj.id,
                roomKey,
                label: `${obj.name}: ${room.name || `Room ${room.id}`}`,
            });
        }
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label));
}

function formatMonthHeader(value: string, t: (key: string) => string): string {
    const [y, m] = value.split('-').map(Number);
    if (!y || !m) return value;
    const monthName = t(`accountancy.months.${m}`);
    return `${monthName.slice(0, 3)} ${String(y).slice(2)}`;
}

export default function LockPeriodPage() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const { objects } = useObjects();

    const hasAccess = isAdmin || isAccountant;

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [closedData, setClosedData] = useState<ClosedPeriodsData>({ globalMonths: [], roomPeriods: [] });
    const [savedReports, setSavedReports] = useState<SavedOwnerReportStatus[]>([]);
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedRooms, setSelectedRooms] = useState<UserObject[]>([]);
    const [formError, setFormError] = useState<string | null>(null);

    const closedCache = useMemo(() => buildClosedPeriodsCache(closedData), [closedData]);
    const savedByKey = useMemo(() => {
        const map = new Map<string, SavedOwnerReportStatus>();
        for (const report of savedReports) {
            map.set(ownerReportSnapshotKey(report.reportMonth, report.objectId, report.roomKey), report);
        }
        return map;
    }, [savedReports]);
    const allRoomsSelection = useMemo(() => buildAllRoomsUserObjects(objects), [objects]);
    const matrixMonths = useMemo(() => buildMatrixMonths(), []);
    const matrixRows = useMemo(() => buildMatrixRoomRows(objects), [objects]);
    const savedSummary = useMemo(() => {
        let locked = 0;
        let saved = 0;
        let passed = 0;
        let failed = 0;
        for (const row of matrixRows) {
            for (const month of matrixMonths) {
                if (!isLedgerPeriodClosed(closedCache, month, row.objectId, row.roomKey)) continue;
                locked += 1;
                const report = savedByKey.get(ownerReportSnapshotKey(month, row.objectId, row.roomKey));
                if (!report?.saved) continue;
                saved += 1;
                if (report.checkPassed) passed += 1;
                else failed += 1;
            }
        }
        return { locked, saved, passed, failed, missing: locked - saved };
    }, [closedCache, matrixMonths, matrixRows, savedByKey]);

    const monthOptions = useMemo(() => {
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
    }, [t]);

    const loadClosedPeriods = useCallback(async () => {
        const data = await getLockPeriodPageData();
        setClosedData({ globalMonths: data.globalMonths, roomPeriods: data.roomPeriods });
        setSavedReports(data.savedReports);
    }, []);

    useEffect(() => {
        if (!hasAccess) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const data = await getLockPeriodPageData();
                if (!cancelled) {
                    setClosedData({ globalMonths: data.globalMonths, roomPeriods: data.roomPeriods });
                    setSavedReports(data.savedReports);
                }
            } catch (error) {
                if (!cancelled) {
                    setSnackbar({
                        open: true,
                        message: getApiErrorMessage(error, t('common.serverError')),
                        severity: 'error',
                    });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // t и setSnackbar намеренно не в deps — t пересоздаётся каждый рендер
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAccess]);

    const handleSelectAllRooms = () => {
        setSelectedRooms(allRoomsSelection);
        setFormError(null);
    };

    const handleSubmit = async (action: 'close' | 'reopen') => {
        if (!selectedMonth) {
            setFormError(t('accountancy.lockPeriod.selectMonthError'));
            return;
        }
        const rooms = userObjectsToRoomPeriods(selectedRooms);
        if (rooms.length === 0) {
            setFormError(t('accountancy.lockPeriod.selectRoomsError'));
            return;
        }
        setFormError(null);
        setSubmitting(true);
        try {
            const res =
                action === 'close'
                    ? await closeReportRoomPeriods(selectedMonth, rooms)
                    : await reopenReportRoomPeriods(selectedMonth, rooms);
            setSnackbar({
                open: true,
                message:
                    res.message ||
                    (action === 'close'
                        ? t('accountancy.reportPeriodLockedSuccess')
                        : t('accountancy.reportPeriodUnlockedSuccess')),
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                await loadClosedPeriods();
            }
        } catch (error) {
            setSnackbar({
                open: true,
                message: getApiErrorMessage(error, t('common.serverError')),
                severity: 'error',
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Alert severity="warning">{t('accountancy.noAccess')}</Alert>
            </Box>
        );
    }

    return (
        <>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>

            <Typography variant="h4" sx={{ mb: 1 }}>
                {t('accountancy.lockPeriod.title')}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
                {t('accountancy.lockPeriod.description')}
            </Typography>
            <Box sx={{ mb: 3 }}>
                <Link href="/dashboard/accountancy/migration/closed-reports">
                    <Button variant="text" size="small">
                        {t('accountancy.migrateClosedReports.title')}
                    </Button>
                </Link>
            </Box>

            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                <Stack spacing={2}>
                    {formError ? <Alert severity="error">{formError}</Alert> : null}

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }}>
                        <FormControl sx={{ minWidth: 220 }} size="small">
                            <InputLabel>{t('accountancy.selectMonth')}</InputLabel>
                            <Select
                                label={t('accountancy.selectMonth')}
                                value={selectedMonth}
                                onChange={(e) => {
                                    setSelectedMonth(e.target.value);
                                    setFormError(null);
                                }}
                            >
                                {monthOptions.map((o) => (
                                    <MenuItem key={o.value} value={o.value}>
                                        {o.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Box sx={{ flex: 1, minWidth: 280 }}>
                            <Stack direction="row" spacing={1} alignItems="flex-start">
                                <Box sx={{ flex: 1 }}>
                                    <RoomsMultiSelect
                                        value={selectedRooms}
                                        onChange={(value) => {
                                            setSelectedRooms(value);
                                            setFormError(null);
                                        }}
                                        label={t('accountancy.lockPeriod.selectRooms')}
                                    />
                                </Box>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={handleSelectAllRooms}
                                    sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
                                >
                                    {t('common.selectAll')}
                                </Button>
                            </Stack>
                        </Box>
                    </Stack>

                    <Stack direction="row" spacing={1}>
                        <Button
                            variant="contained"
                            color="warning"
                            startIcon={<LockIcon />}
                            disabled={submitting}
                            onClick={() => void handleSubmit('close')}
                        >
                            {t('accountancy.lockPeriod.lockPeriod')}
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<LockOpenIcon />}
                            disabled={submitting}
                            onClick={() => void handleSubmit('reopen')}
                        >
                            {t('accountancy.lockPeriod.openPeriod')}
                        </Button>
                        {submitting ? <CircularProgress size={24} sx={{ alignSelf: 'center' }} /> : null}
                    </Stack>
                </Stack>
            </Paper>

            <Typography variant="h6" sx={{ mb: 1 }}>
                {t('accountancy.lockPeriod.matrixTitle')}
            </Typography>
            {!loading && savedSummary.locked > 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {t('accountancy.lockPeriod.savedSummary')
                        .replace('{{saved}}', String(savedSummary.saved))
                        .replace('{{passed}}', String(savedSummary.passed))
                        .replace('{{failed}}', String(savedSummary.failed))
                        .replace('{{missing}}', String(savedSummary.missing))}
                </Typography>
            ) : null}
            <Stack direction="row" spacing={2} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
                <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box sx={{ width: 14, height: 14, bgcolor: 'warning.light', border: '1px solid', borderColor: 'divider' }} />
                    <Typography variant="caption">{t('accountancy.lockPeriod.legendLocked')}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box sx={{ width: 14, height: 14, bgcolor: 'success.light', border: '1px solid', borderColor: 'divider' }} />
                    <Typography variant="caption">{t('accountancy.lockPeriod.legendPassed')}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box sx={{ width: 14, height: 14, bgcolor: 'error.light', border: '1px solid', borderColor: 'divider' }} />
                    <Typography variant="caption">{t('accountancy.lockPeriod.legendFailed')}</Typography>
                </Stack>
            </Stack>

            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : matrixRows.length === 0 ? (
                <Typography color="text.secondary">{t('accountancy.noStatsForSelection')}</Typography>
            ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520 }}>
                    <Table size="small" stickyHeader sx={{ '& .MuiTableCell-root': { py: 0.25, px: 0.5, fontSize: '0.7rem' } }}>
                        <TableHead>
                            <TableRow>
                                <TableCell
                                    sx={{
                                        minWidth: 180,
                                        maxWidth: 220,
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 3,
                                        bgcolor: 'background.paper',
                                    }}
                                >
                                    {t('common.room')}
                                </TableCell>
                                {matrixMonths.map((month) => (
                                    <TableCell
                                        key={month}
                                        align="center"
                                        sx={{ minWidth: 52, px: 0.25, lineHeight: 1.1, whiteSpace: 'nowrap' }}
                                    >
                                        {formatMonthHeader(month, t)}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {matrixRows.map((row) => (
                                <TableRow
                                    key={`${row.objectId}:${row.roomKey}`}
                                    hover
                                    sx={{
                                        '&:hover .lock-matrix-cell': {
                                            bgcolor: 'action.hover',
                                        },
                                        '&:hover .lock-matrix-cell--locked': {
                                            bgcolor: 'warning.main',
                                        },
                                        '&:hover .lock-matrix-cell--passed': {
                                            bgcolor: 'success.main',
                                        },
                                        '&:hover .lock-matrix-cell--failed': {
                                            bgcolor: 'error.main',
                                        },
                                    }}
                                >
                                    <TableCell
                                        className="lock-matrix-cell"
                                        sx={{
                                            position: 'sticky',
                                            left: 0,
                                            zIndex: 1,
                                            bgcolor: 'background.paper',
                                            maxWidth: 220,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                        title={row.label}
                                    >
                                        {row.label}
                                    </TableCell>
                                    {matrixMonths.map((month) => {
                                        const locked = isLedgerPeriodClosed(
                                            closedCache,
                                            month,
                                            row.objectId,
                                            row.roomKey,
                                        );
                                        const report = savedByKey.get(
                                            ownerReportSnapshotKey(month, row.objectId, row.roomKey),
                                        );
                                        const saved = Boolean(locked && report?.saved);
                                        const passed = saved && report?.checkPassed === true;
                                        const failed = saved && !passed;
                                        const cellClass = failed
                                            ? 'lock-matrix-cell lock-matrix-cell--failed'
                                            : passed
                                              ? 'lock-matrix-cell lock-matrix-cell--passed'
                                              : locked
                                                ? 'lock-matrix-cell lock-matrix-cell--locked'
                                                : 'lock-matrix-cell';
                                        const title = failed
                                            ? t('accountancy.lockPeriod.cellSavedFailed')
                                            : passed
                                              ? t('accountancy.lockPeriod.cellSavedPassed')
                                              : locked
                                                ? t('accountancy.lockPeriod.cellLockedNoReport')
                                                : undefined;
                                        return (
                                            <TableCell
                                                key={month}
                                                className={cellClass}
                                                align="center"
                                                sx={{
                                                    p: 0,
                                                    bgcolor: failed
                                                        ? 'error.light'
                                                        : passed
                                                          ? 'success.light'
                                                          : locked
                                                            ? 'warning.light'
                                                            : 'transparent',
                                                    borderLeft: '1px solid',
                                                    borderColor: 'divider',
                                                    color: failed || passed ? 'text.primary' : undefined,
                                                    fontWeight: 700,
                                                }}
                                                title={title}
                                            >
                                                {failed ? '!' : passed ? '✓' : ''}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </>
    );
}

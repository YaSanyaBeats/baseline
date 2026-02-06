'use client'

import { useEffect, useState, useMemo, useCallback } from "react";
import {
    Box,
    Button,
    Typography,
    Alert,
    Stack,
    Paper,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Chip,
} from "@mui/material";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { AuditLog, AuditLogAction, AuditLogEntity } from "@/lib/types";
import axios from "axios";

export default function AuditLogsPage() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [skip, setSkip] = useState(0);
    const limit = 50;

    // Фильтры
    const [entityFilter, setEntityFilter] = useState<AuditLogEntity | 'all'>('all');
    const [actionFilter, setActionFilter] = useState<AuditLogAction | 'all'>('all');
    const [dateFromFilter, setDateFromFilter] = useState<string>('');
    const [dateToFilter, setDateToFilter] = useState<string>('');

    const { hasAccess } = useMemo(() => {
        const hasAccess = isAdmin || isAccountant;
        return { hasAccess };
    }, [isAdmin, isAccountant]);

    const loadLogs = useCallback(async (reset: boolean = false) => {
        if (!hasAccess) return;

        try {
            setLoading(true);
            const currentSkip = reset ? 0 : skip;

            const params: any = {
                limit,
                skip: currentSkip,
                sortField: 'timestamp',
                sortOrder: 'desc',
            };

            if (entityFilter !== 'all') {
                params.entity = entityFilter;
            }
            if (actionFilter !== 'all') {
                params.action = actionFilter;
            }
            if (dateFromFilter) {
                params.startDate = new Date(dateFromFilter).toISOString();
            }
            if (dateToFilter) {
                params.dateTo = new Date(dateToFilter).toISOString();
            }

            const response = await axios.get('/api/auditLogs', { params });

            if (response.data.success) {
                if (reset) {
                    setLogs(response.data.data);
                    setSkip(0);
                } else {
                    setLogs((prev) => [...prev, ...response.data.data]);
                }
                setTotal(response.data.total);
            }
        } catch (error) {
            console.error('Error loading audit logs:', error);
        } finally {
            setLoading(false);
        }
    }, [hasAccess, skip, limit, entityFilter, actionFilter, dateFromFilter, dateToFilter]);

    useEffect(() => {
        if (hasAccess) {
            loadLogs(true);
        }
    }, [hasAccess, loadLogs]);

    const handleApplyFilters = () => {
        loadLogs(true);
    };

    const handleResetFilters = () => {
        setEntityFilter('all');
        setActionFilter('all');
        setDateFromFilter('');
        setDateToFilter('');
        setTimeout(() => loadLogs(true), 100);
    };

    const handleLoadMore = () => {
        setSkip((prev) => prev + limit);
        setTimeout(() => loadLogs(false), 100);
    };

    useEffect(() => {
        if (skip > 0) {
            loadLogs(false);
        }
    }, [skip, loadLogs]);

    const getEntityColor = (entity: AuditLogEntity): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
        switch (entity) {
            case 'expense':
                return 'error';
            case 'income':
                return 'success';
            case 'user':
                return 'primary';
            case 'report':
                return 'info';
            case 'category':
                return 'secondary';
            default:
                return 'default';
        }
    };

    const getActionColor = (action: AuditLogAction): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
        switch (action) {
            case 'create':
                return 'success';
            case 'update':
                return 'warning';
            case 'delete':
                return 'error';
            default:
                return 'default';
        }
    };

    if (!hasAccess) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">
                    {t('common.error')}: Недостаточно прав для просмотра журнала изменений
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>
                {t('auditLogs.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {t('auditLogs.subtitle')}
            </Typography>

            {/* Фильтры */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <FormControl fullWidth>
                            <InputLabel>{t('auditLogs.filterByEntity')}</InputLabel>
                            <Select
                                value={entityFilter}
                                onChange={(e) => setEntityFilter(e.target.value as AuditLogEntity | 'all')}
                                label={t('auditLogs.filterByEntity')}
                            >
                                <MenuItem value="all">{t('auditLogs.entityTypes.all')}</MenuItem>
                                <MenuItem value="expense">{t('auditLogs.entityTypes.expense')}</MenuItem>
                                <MenuItem value="income">{t('auditLogs.entityTypes.income')}</MenuItem>
                                <MenuItem value="report">{t('auditLogs.entityTypes.report')}</MenuItem>
                                <MenuItem value="user">{t('auditLogs.entityTypes.user')}</MenuItem>
                                <MenuItem value="category">{t('auditLogs.entityTypes.category')}</MenuItem>
                                <MenuItem value="booking">{t('auditLogs.entityTypes.booking')}</MenuItem>
                                <MenuItem value="other">{t('auditLogs.entityTypes.other')}</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl fullWidth>
                            <InputLabel>{t('auditLogs.filterByAction')}</InputLabel>
                            <Select
                                value={actionFilter}
                                onChange={(e) => setActionFilter(e.target.value as AuditLogAction | 'all')}
                                label={t('auditLogs.filterByAction')}
                            >
                                <MenuItem value="all">{t('auditLogs.actionTypes.all')}</MenuItem>
                                <MenuItem value="create">{t('auditLogs.actionTypes.create')}</MenuItem>
                                <MenuItem value="update">{t('auditLogs.actionTypes.update')}</MenuItem>
                                <MenuItem value="delete">{t('auditLogs.actionTypes.delete')}</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <TextField
                            fullWidth
                            type="date"
                            label={t('auditLogs.dateFrom')}
                            value={dateFromFilter}
                            onChange={(e) => setDateFromFilter(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />

                        <TextField
                            fullWidth
                            type="date"
                            label={t('auditLogs.dateTo')}
                            value={dateToFilter}
                            onChange={(e) => setDateToFilter(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Stack>

                    <Stack direction="row" spacing={2}>
                        <Button variant="contained" onClick={handleApplyFilters}>
                            {t('auditLogs.applyFilters')}
                        </Button>
                        <Button variant="outlined" onClick={handleResetFilters}>
                            {t('auditLogs.resetFilters')}
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            {/* Статистика */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="body2">
                    {t('auditLogs.showing')} {logs.length} {t('auditLogs.of')} {total} {t('auditLogs.records')}
                </Typography>
            </Paper>

            {/* Таблица логов */}
            {loading && logs.length === 0 ? (
                <Paper sx={{ p: 2 }}>
                    <Typography>Загрузка...</Typography>
                </Paper>
            ) : logs.length === 0 ? (
                <Paper sx={{ p: 2 }}>
                    <Typography>{t('auditLogs.noLogs')}</Typography>
                </Paper>
            ) : (
                <>
                    <Paper sx={{ overflowX: 'auto' }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('auditLogs.columns.timestamp')}</TableCell>
                                    <TableCell>{t('auditLogs.columns.entity')}</TableCell>
                                    <TableCell>{t('auditLogs.columns.action')}</TableCell>
                                    <TableCell>{t('auditLogs.columns.user')}</TableCell>
                                    <TableCell>{t('auditLogs.columns.description')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {logs.map((log, index) => (
                                    <TableRow key={log._id || index}>
                                        <TableCell>
                                            {new Date(log.timestamp).toLocaleString('ru-RU', {
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={t(`auditLogs.entityTypes.${log.entity}`)}
                                                color={getEntityColor(log.entity)}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={t(`auditLogs.actionTypes.${log.action}`)}
                                                color={getActionColor(log.action)}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {log.userName} ({log.userRole})
                                        </TableCell>
                                        <TableCell>{log.description}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>

                    {/* Кнопка "Загрузить ещё" */}
                    {logs.length < total && (
                        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                            <Button
                                variant="outlined"
                                onClick={handleLoadMore}
                                disabled={loading}
                            >
                                {loading ? 'Загрузка...' : t('auditLogs.loadMore')}
                            </Button>
                        </Box>
                    )}
                </>
            )}
        </Box>
    );
}

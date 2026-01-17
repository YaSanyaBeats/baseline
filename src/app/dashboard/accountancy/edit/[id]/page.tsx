'use client'

import { Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography, Alert, CircularProgress } from "@mui/material"
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useEffect, useState } from "react";
import { Report } from "@/lib/types";
import { updateReport, getReports } from "@/lib/reports";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { useRouter, useParams } from 'next/navigation';
import RoomsMultiSelect from "@/components/objectsMultiSelect/RoomsMultiSelect";
import { UserObject } from "@/lib/types";

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const params = useParams();
    const reportId = params?.id as string;
    const { isAdmin, isAccountant } = useUser();
    const [report, setReport] = useState<Partial<Report>>({});
    const [selectedObjects, setSelectedObjects] = useState<UserObject[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { setSnackbar } = useSnackbar();

    // Проверка доступа
    const hasAccess = isAdmin || isAccountant;

    // Загрузка данных отчёта
    useEffect(() => {
        if (hasAccess && reportId) {
            getReports().then((reports) => {
                const foundReport = reports.find(r => r._id === reportId);
                if (foundReport) {
                    setReport(foundReport);
                    // Восстанавливаем выбранные объекты и комнаты
                    if (foundReport.objectId && foundReport.roomIds) {
                        setSelectedObjects([{
                            id: foundReport.objectId,
                            rooms: foundReport.roomIds
                        }]);
                    }
                } else {
                    setSnackbar({
                        open: true,
                        message: t('accountancy.reportNotFound'),
                        severity: 'error',
                    });
                    router.push('/dashboard/accountancy');
                }
            }).catch((error) => {
                console.error('Error loading data:', error);
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
                router.push('/dashboard/accountancy');
            }).finally(() => {
                setLoadingData(false);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAccess, reportId, router]);

    const validateUrl = (url: string): boolean => {
        if (!url) return false;
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    const handleChangeReportLink = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value || '';
        setReport({ ...report, reportLink: value });
        if (value && !validateUrl(value)) {
            setErrors({ ...errors, reportLink: t('accountancy.reportLinkError') });
        } else {
            const newErrors = { ...errors };
            delete newErrors.reportLink;
            setErrors(newErrors);
        }
    }

    const handleChangeMonth = (event: any) => {
        const value = event.target.value;
        const month = typeof value === 'string' ? parseInt(value) : value;
        if (month >= 1 && month <= 12) {
            setReport({ ...report, reportMonth: month });
            const newErrors = { ...errors };
            delete newErrors.reportMonth;
            setErrors(newErrors);
        }
    }

    const handleChangeYear = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        const year = parseInt(value);
        const currentYear = new Date().getFullYear();
        if (value && !isNaN(year) && year >= 2000 && year <= currentYear + 1) {
            setReport({ ...report, reportYear: year });
            const newErrors = { ...errors };
            delete newErrors.reportYear;
            setErrors(newErrors);
        } else if (!value) {
            setReport({ ...report, reportYear: undefined });
        } else {
            setErrors({ ...errors, reportYear: t('accountancy.yearError') });
        }
    }

    const handleChangeObjects = (value: UserObject[]) => {
        setSelectedObjects(value);
        // Извлекаем objectId и roomIds из первого выбранного объекта
        const objectId = value.length > 0 ? value[0].id : undefined;
        const roomIds = value.length > 0 && value[0].rooms && value[0].rooms.length > 0 
            ? value[0].rooms 
            : undefined;
        setReport({ ...report, objectId: objectId, roomIds: roomIds });
        const newErrors = { ...errors };
        if (objectId) {
            delete newErrors.objectId;
        }
        if (roomIds && roomIds.length > 0) {
            delete newErrors.roomIds;
        }
        setErrors(newErrors);
    }

    const handleSubmit = () => {
        // Проверка валидации перед отправкой
        const validationErrors: Record<string, string> = {};
        
        if (!report.reportLink || !validateUrl(report.reportLink)) {
            validationErrors.reportLink = t('accountancy.reportLinkError');
        }
        if (!report.reportMonth) {
            validationErrors.reportMonth = t('accountancy.monthError');
        }
        if (!report.reportYear) {
            validationErrors.reportYear = t('accountancy.yearError');
        }
        if (!report.objectId) {
            validationErrors.objectId = t('accountancy.objectError');
        }
        if (!report.roomIds || report.roomIds.length === 0) {
            validationErrors.roomIds = t('accountancy.roomError');
        }

        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            setSnackbar({
                open: true,
                message: t('accountancy.formErrors'),
                severity: 'error',
            });
            return;
        }

        setLoading(true);
        updateReport(report as Report).then((res) => {
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            setLoading(false);
            if (res.success) {
                router.push('/dashboard/accountancy');
            }
        }).catch((error) => {
            console.error('Error updating report:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
            setLoading(false);
        })
    }

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.editReport')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    if (loadingData) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <CircularProgress />
            </Box>
        );
    }
    
    return (
        <>
            <form noValidate autoComplete="off">
                <Typography variant="h4">{t('accountancy.editReport')}</Typography>
                <Stack direction={'column'} spacing={2} mt={2} sx={{maxWidth: '500px'}}>
                    <Box>
                        <TextField
                            id="reportLink"
                            label={t('accountancy.reportLink')}
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            value={report.reportLink || ''}
                            onChange={handleChangeReportLink}
                            error={!!errors.reportLink}
                            helperText={errors.reportLink}
                            placeholder="https://example.com/report"
                        />
                    </Box>
                    <Box>
                        <FormControl sx={{width: '100%'}}>
                            <InputLabel>{t('accountancy.reportMonth')}</InputLabel>
                            <Select
                                value={report.reportMonth || ''}
                                onChange={handleChangeMonth}
                                label={t('accountancy.reportMonth')}
                                error={!!errors.reportMonth}
                            >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => (
                                    <MenuItem key={month} value={String(month)}>
                                        {t(`accountancy.months.${month}`)}
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.reportMonth && (
                                <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                                    {errors.reportMonth}
                                </Typography>
                            )}
                        </FormControl>
                    </Box>
                    <Box>
                        <TextField
                            id="reportYear"
                            label={t('accountancy.reportYear')}
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            type="number"
                            value={report.reportYear || ''}
                            onChange={handleChangeYear}
                            error={!!errors.reportYear}
                            helperText={errors.reportYear}
                            inputProps={{ min: 2000, max: new Date().getFullYear() + 1 }}
                        />
                    </Box>
                    <Box>
                        <RoomsMultiSelect 
                            value={selectedObjects} 
                            onChange={handleChangeObjects}
                            label={t('accountancy.object')}
                            multiple={false}
                        />
                        {errors.objectId && (
                            <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                                {errors.objectId}
                            </Typography>
                        )}
                        {errors.roomIds && (
                            <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                                {errors.roomIds}
                            </Typography>
                        )}
                    </Box>
                </Stack>
                <Stack direction={"row"} spacing={2} mt={2}>
                    <Link href="/dashboard/accountancy">
                        <Button variant="outlined" startIcon={<ArrowBackIcon />}>
                            {t('common.cancel')}
                        </Button>
                    </Link>
                    <Button 
                        variant="contained" 
                        endIcon={<SendIcon />} 
                        onClick={handleSubmit} 
                        disabled={loading}
                    >
                        {t('common.save')}
                    </Button>
                </Stack>
            </form>
        </>
    )
}

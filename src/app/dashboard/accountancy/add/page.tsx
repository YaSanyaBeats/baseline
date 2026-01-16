'use client'

import { Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography, Alert } from "@mui/material"
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { ChangeEvent, useEffect, useState } from "react";
import { Report, User } from "@/lib/types";
import { addReport } from "@/lib/reports";
import { getUsers } from "@/lib/users";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { useRouter } from 'next/navigation';

const defaultReport: Partial<Report> = {
    reportLink: '',
    reportMonth: undefined,
    reportYear: new Date().getFullYear(),
    ownerId: ''
}

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const { user, isAdmin, isAccountant } = useUser();
    const [report, setReport] = useState<Partial<Report>>(defaultReport);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { setSnackbar } = useSnackbar();

    // Проверка доступа
    const hasAccess = isAdmin || isAccountant;

    // Загрузка списка пользователей
    useEffect(() => {
        if (hasAccess) {
            getUsers().then((usersList) => {
                setUsers(usersList);
            }).catch((error) => {
                console.error('Error loading users:', error);
            });
        }
    }, [hasAccess]);

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

    const handleChangeMonth = (event: ChangeEvent<Omit<HTMLInputElement, "value"> & { value: string; }> | (Event & { target: { value: string; name: string; }; })) => {
        const month = parseInt(event.target.value);
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

    const handleChangeOwner = (event: ChangeEvent<Omit<HTMLInputElement, "value"> & { value: string; }> | (Event & { target: { value: string; name: string; }; })) => {
        setReport({ ...report, ownerId: event.target.value });
        const newErrors = { ...errors };
        delete newErrors.ownerId;
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
        if (!report.ownerId) {
            validationErrors.ownerId = t('accountancy.ownerError');
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
        addReport(report as Report).then((res) => {
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
            console.error('Error adding report:', error);
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
                <Typography variant="h4">{t('accountancy.addReport')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }
    
    return (
        <>
            <form noValidate autoComplete="off">
                <Typography variant="h4">{t('accountancy.addReport')}</Typography>
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
                                    <MenuItem key={month} value={month}>
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
                        <FormControl sx={{width: '100%'}}>
                            <InputLabel>{t('accountancy.owner')}</InputLabel>
                            <Select
                                value={report.ownerId || ''}
                                onChange={handleChangeOwner}
                                label={t('accountancy.owner')}
                                error={!!errors.ownerId}
                            >
                                {users.map((user) => (
                                    <MenuItem key={user._id} value={user._id}>
                                        {user.name} ({user.login})
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.ownerId && (
                                <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                                    {errors.ownerId}
                                </Typography>
                            )}
                        </FormControl>
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
                        {t('common.send')}
                    </Button>
                </Stack>
            </form>
        </>
    )
}

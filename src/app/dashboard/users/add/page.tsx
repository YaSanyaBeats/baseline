'use client'

import { Box, Button, FormControl, IconButton, InputAdornment, InputLabel, MenuItem, OutlinedInput, Select, Stack, TextField, Typography } from "@mui/material"
import SendIcon from '@mui/icons-material/Send';
import Link from "next/link";
import { ChangeEvent, useState } from "react";
import { CommonResponse, User, UserObject } from "@/lib/types";
import RoomsMultiSelect from "@/components/objectsMultiSelect/RoomsMultiSelect";
import { VisibilityOff, Visibility } from "@mui/icons-material";
import { sendNewUser } from "@/lib/users";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useRouter } from 'next/navigation';
import { useTranslation } from "@/i18n/useTranslation";

const defaultUser: User = {
    login: '',
    password: '',
    name: '',
    role: "owner",
    objects: [],
    email: '',
    phone: '',
    bankName: '',
    accountNumber: '',
    accountType: 'basic',
    reportLink: ''
}

export default function Page() {
    const { t } = useTranslation();
    const [user, setUser] = useState<User>(defaultUser);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { setSnackbar } = useSnackbar();
    const router = useRouter();

    const handleClickShowPassword = () => setShowPassword((show) => !show);

    const handleChangeLogin = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event?.target?.value;
        if(!value) {
            value = defaultUser.login;
        }

        setUser({
            ...user,
            login: value
        });
    }

    const handleChangeName = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event?.target?.value;
        if(!value) {
            value = defaultUser.name;
        }

        setUser({
            ...user,
            name: value
        });
    }

    const handleChangePassword = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event?.target?.value;
        if(!value) {
            value = defaultUser.password;
        }

        setUser({
            ...user,
            password: value
        });
    }

    const handleChangeRole = (event: ChangeEvent<Omit<HTMLInputElement, "value"> & { value: string; }> | (Event & { target: { value: string; name: string; }; })) => {
        if(event.target.value !== 'admin' && event.target.value !== 'owner') {
            return;
        }
        setUser({
            ...user,
            role: event.target.value
        });
    }

    const handleChangeRooms = (value: UserObject[]) => {
        setUser({
            ...user,
            objects: value
        });
    }

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    const validatePhone = (phone: string): boolean => {
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
    }

    const validateAccountNumber = (accountNumber: string): boolean => {
        return /^\d*$/.test(accountNumber);
    }

    const validateUrl = (url: string): boolean => {
        if (!url) return true; // Пустая ссылка допустима
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    const handleChangeEmail = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value || '';
        setUser({ ...user, email: value });
        if (value && !validateEmail(value)) {
            setErrors({ ...errors, email: t('users.emailError') });
        } else {
            const newErrors = { ...errors };
            delete newErrors.email;
            setErrors(newErrors);
        }
    }

    const handleChangePhone = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value || '';
        setUser({ ...user, phone: value });
        if (value && !validatePhone(value)) {
            setErrors({ ...errors, phone: t('users.phoneError') });
        } else {
            const newErrors = { ...errors };
            delete newErrors.phone;
            setErrors(newErrors);
        }
    }

    const handleChangeBankName = (event: React.ChangeEvent<HTMLInputElement>) => {
        setUser({ ...user, bankName: event.target.value || '' });
    }

    const handleChangeAccountNumber = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value || '';
        if (validateAccountNumber(value)) {
            setUser({ ...user, accountNumber: value });
            const newErrors = { ...errors };
            delete newErrors.accountNumber;
            setErrors(newErrors);
        } else {
            setErrors({ ...errors, accountNumber: t('users.accountNumberError') });
        }
    }

    const handleChangeAccountType = (event: ChangeEvent<Omit<HTMLInputElement, "value"> & { value: string; }> | (Event & { target: { value: string; name: string; }; })) => {
        if (event.target.value === 'basic' || event.target.value === 'premium') {
            setUser({ ...user, accountType: event.target.value });
        }
    }

    const handleChangeReportLink = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value || '';
        setUser({ ...user, reportLink: value });
        if (value && !validateUrl(value)) {
            setErrors({ ...errors, reportLink: t('users.reportLinkError') });
        } else {
            const newErrors = { ...errors };
            delete newErrors.reportLink;
            setErrors(newErrors);
        }
    }

    const handleSubmit = () => {
        // Проверка валидации перед отправкой
        const validationErrors: Record<string, string> = {};
        
        if (user.email && !validateEmail(user.email)) {
            validationErrors.email = t('users.emailError');
        }
        if (user.phone && !validatePhone(user.phone)) {
            validationErrors.phone = t('users.phoneError');
        }
        if (user.accountNumber && !validateAccountNumber(user.accountNumber)) {
            validationErrors.accountNumber = t('users.accountNumberError');
        }
        if (user.reportLink && !validateUrl(user.reportLink)) {
            validationErrors.reportLink = t('users.reportLinkError');
        }

        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            setSnackbar({
                open: true,
                message: t('users.formErrors'),
                severity: 'error',
            });
            return;
        }

        setLoading(true);
        sendNewUser(user).then((res: CommonResponse) => {
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            setLoading(false);
            router.push('/dashboard/users');
        }).catch((error) => {
            console.log(error);
            setLoading(false);
        })
    }
    
    return (
        <>
            <form noValidate autoComplete="off">
                <Typography variant="h4">{t('users.addUser')}</Typography>
                <Stack direction={'column'} spacing={1} mt={2} sx={{maxWidth: '400px'}}>
                    <Box>
                        <TextField
                            id="name"
                            label={t('users.name')}
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            onChange={handleChangeName} 
                        />
                    </Box>
                    <Box>
                        <TextField
                            id="new-login"
                            label={t('users.login')}
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            onChange={handleChangeLogin} 
                        />
                    </Box>
                    <Box>
                        <FormControl sx={{width: '100%'}}>
                            <Select
                                value={user.role}
                                onChange={handleChangeRole}
                            >
                                <MenuItem value={'admin'}>{t('users.admin')}</MenuItem>
                                <MenuItem value={'owner'}>{t('users.owner')}</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                    <Box>
                        <RoomsMultiSelect value={user.objects} onChange={handleChangeRooms}></RoomsMultiSelect>
                    </Box>
                    <Box>
                        <FormControl variant="outlined" sx={{width: '100%'}}>
                            <InputLabel>{t('users.password')}</InputLabel>
                            <OutlinedInput
                                id="new-password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                onChange={handleChangePassword}
                                endAdornment={
                                <InputAdornment position="end">
                                    <IconButton
                                        onClick={handleClickShowPassword}
                                        edge="end"
                                    >
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                                }
                                label={t('users.password')}
                            />
                        </FormControl>
                    </Box>
                    <Box>
                        <TextField
                            id="email"
                            label={t('users.email')}
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            value={user.email || ''}
                            onChange={handleChangeEmail}
                            error={!!errors.email}
                            helperText={errors.email}
                            type="email"
                        />
                    </Box>
                    <Box>
                        <TextField
                            id="phone"
                            label={t('users.phone')}
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            value={user.phone || ''}
                            onChange={handleChangePhone}
                            error={!!errors.phone}
                            helperText={errors.phone}
                            placeholder="+7 (999) 123-45-67"
                        />
                    </Box>
                    <Box>
                        <TextField
                            id="bankName"
                            label={t('users.bankName')}
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            value={user.bankName || ''}
                            onChange={handleChangeBankName}
                        />
                    </Box>
                    <Box>
                        <TextField
                            id="accountNumber"
                            label={t('users.accountNumber')}
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            value={user.accountNumber || ''}
                            onChange={handleChangeAccountNumber}
                            error={!!errors.accountNumber}
                            helperText={errors.accountNumber}
                            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                        />
                    </Box>
                    <Box>
                        <FormControl sx={{width: '100%'}}>
                            <InputLabel>{t('users.accountType')}</InputLabel>
                            <Select
                                value={user.accountType || 'basic'}
                                onChange={handleChangeAccountType}
                                label={t('users.accountType')}
                            >
                                <MenuItem value={'basic'}>{t('header.basic')}</MenuItem>
                                <MenuItem value={'premium'}>{t('header.premium')}</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                    <Box>
                        <TextField
                            id="reportLink"
                            label={t('users.reportLink')}
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            value={user.reportLink || ''}
                            onChange={handleChangeReportLink}
                            error={!!errors.reportLink}
                            helperText={errors.reportLink}
                            placeholder="https://example.com/report"
                        />
                    </Box>
                </Stack>
                <Stack direction={"row"} spacing={2} mt={2}>
                    <Link href="/dashboard/users">
                        <Button variant="outlined">{t('common.cancel')}</Button>
                    </Link>
                    <Button 
                        variant="contained" 
                        endIcon={<SendIcon />} 
                        onClick={handleSubmit} 
                        loading={loading} 
                    >
                        {t('common.send')}
                    </Button>
                </Stack>
            </form>
        </>
    )
}
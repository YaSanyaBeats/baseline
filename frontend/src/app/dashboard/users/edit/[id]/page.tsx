'use client'

import { Box, Button, FormControl, IconButton, InputAdornment, InputLabel, MenuItem, OutlinedInput, Select, Stack, TextField, Typography } from "@mui/material"
import SendIcon from '@mui/icons-material/Send';
import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { CommonResponse, User, UserObject } from "@/lib/types";
import RoomsMultiSelect from "@/components/objectsMultiSelect/RoomsMultiSelect";
import { VisibilityOff, Visibility } from "@mui/icons-material";
import { getUser, sendEditUser } from "@/lib/users";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useParams } from 'next/navigation';

const defaultUser: User = {
    login: '',
    password: '',
    name: '',
    role: "owner",
    objects: []
}

export default function Page() {
    const [user, setUser] = useState<User>(defaultUser);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { setSnackbar } = useSnackbar();
    const params = useParams();

    useEffect(() => {
        getUser(params.id as string).then((currentUser) => {
            setUser((prevUser) => ({
                _id: currentUser._id,
                login: currentUser.login,
                role: currentUser.role,
                name: currentUser.name,
                // сохраняем введённый пользователем пароль, не затираем его данными с сервера
                password: prevUser.password,
                objects: currentUser.objects
            }));
            console.log(currentUser);
        })
    }, [params.id])

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
        if(event.target.value !== 'admin' && event.target.value != 'owner') {
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

    const handleSubmit = () => {
        setLoading(true);

        sendEditUser(user).then((res: CommonResponse) => {
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            setLoading(false);
            //router.push('/dashboard/users');
        }).catch((error) => {
            console.log(error);
            setLoading(false);
        })
    }
    
    return (
        <>
            <form noValidate autoComplete="off">
                <Typography variant="h4">Редактировать пользователя {user.login}</Typography>
                <Stack direction={'column'} spacing={1} mt={2} sx={{maxWidth: '400px'}}>
                    <Box>
                        <TextField
                            id="name"
                            label="Имя"
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            value={user.name}
                            onChange={handleChangeName} 
                        />
                    </Box>
                    <Box>
                        <TextField
                            id="new-login"
                            label="Логин"
                            variant="outlined"
                            sx={{width: '100%'}}
                            autoComplete="off"
                            value={user.login}
                            onChange={handleChangeLogin} 
                        />
                    </Box>
                    <Box>
                        <FormControl sx={{width: '100%'}}>
                            <Select
                                value={user.role || 'owner'}
                                onChange={handleChangeRole}
                            >
                                <MenuItem value={'admin'}>Администратор</MenuItem>
                                <MenuItem value={'owner'}>Владелец</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                    <Box>
                        <RoomsMultiSelect value={user.objects} onChange={handleChangeRooms}></RoomsMultiSelect>
                    </Box>
                    <Box>
                        <FormControl variant="outlined" sx={{width: '100%'}}>
                            <InputLabel>Password</InputLabel>
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
                                label="Password"
                            />
                        </FormControl>
                    </Box>
                </Stack>
                <Stack direction={"row"} spacing={2} mt={2}>
                    <Link href="/dashboard/users">
                        <Button variant="outlined">Отмена</Button>
                    </Link>
                    <Button 
                        variant="contained" 
                        endIcon={<SendIcon />} 
                        onClick={handleSubmit} 
                        loading={loading} 
                    >
                        Отправить
                    </Button>
                </Stack>
            </form>
        </>
    )
}
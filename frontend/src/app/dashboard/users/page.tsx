'use client'

import { Room, User, UserObject } from "@/lib/types";
import { getUsers, sendDeleteUser } from "@/lib/users";
import { TableContainer, Paper, Table, TableHead, TableRow, TableCell, TableBody, Skeleton, Stack, Box, IconButton, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography, Grid } from "@mui/material";
import { useEffect, useState } from "react";
import StarIcon from '@mui/icons-material/Star';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import Link from "next/link";
import DeleteIcon from '@mui/icons-material/Delete';
import { red } from "@mui/material/colors";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useObjects } from "@/providers/ObjectsProvider";

const roleDictionary = {
    'admin': 'Администратор',
    'owner': 'Владелец'
}

export default function Page() {
    const { objects, loading } = useObjects();
    const [users, setUsers] = useState<User[]>([]);
    const [openConfirm, setOpenConfirm] = useState(false);
    const [selectedDeleteUser, setSelectedDeleteUser] = useState('');
    const { snackbar, setSnackbar } = useSnackbar();
    
    const handleClose = () => {
        setOpenConfirm(false);
    }

    const handleDeleteClick = (id: string | undefined) => {
        if(!id) {
            return;
        }
        setSelectedDeleteUser(id);
        setOpenConfirm(true);
    }

    const handleDeleteUser = async () => {
        sendDeleteUser(selectedDeleteUser).then((result) => {
            setSnackbar({
                open: true,
                message: result.message,
                severity: result.success ? 'success' : 'error',
            });
            updateUsers();
            setOpenConfirm(false);
        })
    }

    const updateUsers = () => {
        getUsers().then((users: User[]) => {
            setUsers(users);
        })
    }

    const getObjectsLabelObject = (selectedObjects: UserObject[]) => {
        const result = [] as {
            objectLabel: string,
            roomsLabel: string
        }[];

        selectedObjects?.forEach((selectedObject) => {
            const findedObject = objects.find(object => object.id === selectedObject.id);
            const findedRooms = findedObject?.roomTypes.filter(innerRoom => selectedObject.rooms.includes(innerRoom.id));
            if(!findedObject || !findedRooms) {
                return;
            }
            const roomsLabel = findedRooms.map(room => room.name ? room.name : room.id).join(', ');
            result.push({
                objectLabel: findedObject.name,
                roomsLabel: roomsLabel
            });
        })
        return result;
    }

    useEffect(() => {
        updateUsers();
    }, [])

    if (!users) return (
        <Stack spacing={1}>
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
        </Stack>
    )

    return (
        <>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                    <TableRow>
                        <TableCell>Пользователь</TableCell>
                        <TableCell>Роль</TableCell>
                        <TableCell>Имеет доступ к:</TableCell>
                        <TableCell sx={{width: '30px'}}/>
                        <TableCell sx={{width: '30px'}}/>
                    </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.map((user, index) => (
                            <TableRow key={index}>
                                <TableCell component="th">
                                    <Stack direction={"row"} alignItems={"center"} spacing={1}>
                                        {user.role === 'admin' && (<StarIcon/>)}
                                        <Box>
                                            {user.name}
                                        </Box>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    {roleDictionary[user.role]}
                                </TableCell>
                                <TableCell>
                                    {getObjectsLabelObject(user.objects).map((record, index) => (
                                        <Grid container spacing={2} key={index}>
                                            <Grid size={2} fontWeight={"bold"}>{record.objectLabel}:</Grid>
                                            <Grid size={5}>{record.roomsLabel}</Grid>
                                        </Grid>
                                    ))}
                                </TableCell>
                                <TableCell align="right">
                                    <Link href={"/dashboard/users/edit/" + user._id}>
                                        <IconButton>
                                            <EditIcon/>
                                        </IconButton>
                                    </Link>
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton onClick={handleDeleteClick.bind(null, user._id)}>
                                        <DeleteIcon sx={{color: red[400]}}/>
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <Dialog
                open={openConfirm}
                onClose={handleClose}
            >
                <DialogTitle>Вы точно хотите удалить пользователя?</DialogTitle>
                <DialogContent>
                    <DialogContentText>Это действие необратимо</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Отмена</Button>
                    <Button onClick={handleDeleteUser} variant="outlined" autoFocus color="error">Удалить пользователя</Button>
                </DialogActions>
            </Dialog>
            <Link href="/dashboard/users/add/">
                <Button variant="contained" startIcon={<PersonAddAlt1Icon />} sx={{mt: 2}}>Добавить пользователя</Button>
            </Link>
        </>
    )
}
'use client'
import { Box, Collapse, IconButton, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LaunchIcon from '@mui/icons-material/Launch';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EditIcon from '@mui/icons-material/Edit';

import { useState } from 'react'
import { useSession } from 'next-auth/react';
import { Object, Room } from '@/lib/types';
import { useObjects } from '@/providers/ObjectsProvider';
import { useUser } from '@/providers/UserProvider';
import BookingsModal from '@/components/bookingsModal/BookingsModal';
import BusynessCalendarModal from '@/components/busynessCalendarModal/BusynessCalendarModal';
import ObjectEditDialog from '@/components/dashboard/ObjectEditDialog';
import RoomEditDialog from '@/components/dashboard/RoomEditDialog';
import { useTranslation } from '@/i18n/useTranslation';
import { useSnackbar } from '@/providers/SnackbarContext';
import { updateObjectMetadata, updateRoomMetadata } from '@/lib/objectRoomMetadata';

function Row(
    props: { 
        object: Object, 
        setSelectedRoom: (value: { object: Object; room: Room } | null) => void, 
        setOpenBookingModal: (arg0: boolean) => void, 
        setSelectedObject: (arg0: Object | null) => void, 
        setOpenBusynessCalendarModal: (arg0: boolean) => void, 
        setOpenObjectEditDialog: (object: Object | null) => void,
        setOpenRoomEditDialog: (object: Object | null, room: Room | null) => void,
        isAdmin: boolean,
    }
) {
  const { object, setSelectedRoom, setOpenBookingModal, setSelectedObject, setOpenBusynessCalendarModal, setOpenObjectEditDialog, setOpenRoomEditDialog, isAdmin } = props;
  const { accountType } = useUser();
  const { t } = useTranslation();
  const isPremium = accountType === 'premium';
  const [open, setOpen] = useState(false);

  const handleOpenBook = (roomInfo: { object: Object; room: Room }) => {
    setSelectedRoom(roomInfo);
    setOpenBookingModal(true);
  }

  const handleBusynessModal = (object: Object) => {
    setSelectedObject(object);
    setOpenBusynessCalendarModal(true);
  }

  return (
    <>
        <TableRow sx={{ background: (open ? '#00000020' : '') }}>
            <TableCell>
                <IconButton
                    size="small"
                    onClick={() => setOpen(!open)}
                >
                    {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                </IconButton>
            </TableCell>
            <TableCell component="th" scope="row" onClick={() => setOpen(!open)}>
                {object.name}
            </TableCell>
            <TableCell>{object.district ?? '—'}</TableCell>
            <TableCell>{object.objectType ? t(`dashboard.objectType${object.objectType === 'apartments' ? 'Apartments' : 'Villa'}`) : '—'}</TableCell>
            <TableCell sx={{width: '30px'}}>
                <IconButton onClick={handleBusynessModal.bind(null, object)}>
                    <CalendarMonthIcon/>
                </IconButton>
            </TableCell>
            {isAdmin && (
                <TableCell sx={{width: '30px'}}>
                    <IconButton onClick={() => setOpenObjectEditDialog(object)} size="small" title={t('dashboard.editObject')}>
                        <EditIcon fontSize="small"/>
                    </IconButton>
                </TableCell>
            )}
        </TableRow>
        <TableRow>
            <TableCell colSpan={isAdmin ? 6 : 5} sx={{borderBottom: 'none', paddingBottom: 0, paddingTop: 0}}>
                <Collapse in={open} unmountOnExit component={Paper} sx={{marginBlock: 2}}>
                    <Box sx={{ margin: 1 }}>
                    <Typography variant="h6" gutterBottom component="div">
                        {t('common.rooms')}
                    </Typography>
                    <Table size="small" aria-label="purchases" sx={{borderBottom: 'none'}}>
                        <TableHead>
                        <TableRow>
                            <TableCell>{t('common.name')}</TableCell>
                            <TableCell>{t('dashboard.bedrooms')}</TableCell>
                            <TableCell>{t('dashboard.bathrooms')}</TableCell>
                            <TableCell>{t('dashboard.livingRoomSofas')}</TableCell>
                            <TableCell>{t('dashboard.kitchen')}</TableCell>
                            <TableCell>{t('dashboard.level')}</TableCell>
                            {isAdmin && <TableCell>{t('dashboard.whoHasAccess')}</TableCell>}
                            {(isPremium || isAdmin) && (
                                <TableCell align="right"/>
                            )}
                        </TableRow>
                        </TableHead>
                        <TableBody>
                            {object.roomTypes.map((room: Room) => (
                                <TableRow key={room.id}>
                                    <TableCell component="th">
                                        {room.name ? room.name : t('dashboard.unnamed')}
                                    </TableCell>
                                    <TableCell>{room.bedrooms ?? '—'}</TableCell>
                                    <TableCell>{room.bathrooms ?? '—'}</TableCell>
                                    <TableCell>{room.livingRoomSofas ?? '—'}</TableCell>
                                    <TableCell>{room.kitchen ? t(`dashboard.kitchen${room.kitchen === 'yes' ? 'Yes' : 'No'}`) : '—'}</TableCell>
                                    <TableCell>{room.level ? t(`dashboard.level${room.level.charAt(0).toUpperCase() + room.level.slice(1)}`) : '—'}</TableCell>
                                    {isAdmin && (
                                        <TableCell>
                                            {room.accessUsers && room.accessUsers.length
                                                ? room.accessUsers.join(', ')
                                                : '—'}
                                        </TableCell>
                                    )}
                                    {(isPremium || isAdmin) && (
                                        <TableCell align="right">
                                            {isPremium && (
                                                <IconButton onClick={handleOpenBook.bind(null, {
                                                    object: object,
                                                    room: room
                                                })} size="small">
                                                    <LaunchIcon fontSize="small"/>
                                                </IconButton>
                                            )}
                                            {isAdmin && (
                                                <IconButton onClick={() => setOpenRoomEditDialog(object, room)} size="small" title={t('dashboard.editRoom')}>
                                                    <EditIcon fontSize="small"/>
                                                </IconButton>
                                            )}
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    </Box>
                </Collapse>
            </TableCell>
        </TableRow>
    </>
  );
}


export default function Page() {
    const { objects, loading, refreshObjects } = useObjects();
    const { data: session } = useSession();
    const { t } = useTranslation();
    const { setSnackbar } = useSnackbar();
    const isAdmin = session?.user && (session.user as any).role === 'admin';
    const [ openBookingModal, setOpenBookingModal ] = useState(false);
    const [ openBusynessCalendarModal, setOpenBusynessCalendarModal ] = useState(false);
    const [ selectedObject, setSelectedObject ] = useState<Object | null>(null);
    const [ openObjectEditDialog, setOpenObjectEditDialog ] = useState(false);
    const [ objectToEdit, setObjectToEdit ] = useState<Object | null>(null);
    const [ openRoomEditDialog, setOpenRoomEditDialog ] = useState(false);
    const [ roomToEdit, setRoomToEdit ] = useState<{ object: Object; room: Room } | null>(null);

    const [ selectedRoom, setSelectedRoom ] = useState<{
        object: Object,
        room: Room
    } | null>(null)

    const handleOpenObjectEdit = (object: Object | null) => {
        setObjectToEdit(object);
        setOpenObjectEditDialog(!!object);
    };

    const handleOpenRoomEdit = (object: Object | null, room: Room | null) => {
        setRoomToEdit(object && room ? { object, room } : null);
        setOpenRoomEditDialog(!!(object && room));
    };

    const handleSaveObject = async (objectId: number, data: { district?: string; objectType?: 'apartments' | 'villa' }) => {
        try {
            await updateObjectMetadata(objectId, data);
            await refreshObjects();
            setSnackbar({ open: true, message: t('dashboard.objectSaved'), severity: 'success' });
        } catch {
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        }
    };

    const handleSaveRoom = async (
        objectId: number,
        roomId: number,
        data: Parameters<typeof updateRoomMetadata>[2]
    ) => {
        try {
            await updateRoomMetadata(objectId, roomId, data);
            await refreshObjects();
            setSnackbar({ open: true, message: t('dashboard.roomSaved'), severity: 'success' });
        } catch {
            setSnackbar({ open: true, message: t('common.serverError'), severity: 'error' });
        }
    };

    if (loading) return (
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
            <Typography variant='h5' sx={{fontWeight: 600, mb: 2}}>{t('dashboard.myObjects')}</Typography>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell />
                            <TableCell>{t('dashboard.object')}</TableCell>
                            <TableCell>{t('dashboard.district')}</TableCell>
                            <TableCell>{t('dashboard.objectType')}</TableCell>
                            <TableCell />
                            {isAdmin && <TableCell />}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {objects.map((object: Object) => (
                            <Row 
                                key={object.id} 
                                object={object} 
                                setSelectedRoom={setSelectedRoom} 
                                setOpenBookingModal={setOpenBookingModal} 
                                setSelectedObject={setSelectedObject} 
                                setOpenBusynessCalendarModal={setOpenBusynessCalendarModal}
                                setOpenObjectEditDialog={handleOpenObjectEdit}
                                setOpenRoomEditDialog={handleOpenRoomEdit}
                                isAdmin={!!isAdmin}
                            />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <BookingsModal roomInfo={selectedRoom} open={openBookingModal} setOpen={setOpenBookingModal}/>
            <BusynessCalendarModal object={selectedObject} open={openBusynessCalendarModal} setOpen={setOpenBusynessCalendarModal}/>
            <ObjectEditDialog
                open={openObjectEditDialog}
                onClose={() => handleOpenObjectEdit(null)}
                object={objectToEdit}
                onSave={handleSaveObject}
            />
            <RoomEditDialog
                open={openRoomEditDialog}
                onClose={() => handleOpenRoomEdit(null, null)}
                object={roomToEdit?.object ?? null}
                room={roomToEdit?.room ?? null}
                onSave={handleSaveRoom}
            />
        </>
    )
}

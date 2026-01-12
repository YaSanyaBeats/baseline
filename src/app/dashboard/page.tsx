'use client'
import { Box, Collapse, IconButton, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LaunchIcon from '@mui/icons-material/Launch';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

import { useState } from 'react'
import { useSession } from 'next-auth/react';
import { Object, Room } from '@/lib/types';
import { useObjects } from '@/providers/ObjectsProvider';
import { useUser } from '@/providers/UserProvider';
import BookingsModal from '@/components/bookingsModal/BookingsModal';
import BusynessCalendarModal from '@/components/busynessCalendarModal/BusynessCalendarModal';
import { useTranslation } from '@/i18n/useTranslation';

function Row(
    props: { 
        object: Object, 
        setSelectedRoom: (value: { object: Object; room: Room } | null) => void, 
        setOpenBookingModal: (arg0: boolean) => void, 
        setSelectedObject: (arg0: Object | null) => void, 
        setOpenBusynessCalendarModal: (arg0: boolean) => void, 
        isAdmin: boolean,
    }
) {
  const { object, setSelectedRoom, setOpenBookingModal, setSelectedObject, setOpenBusynessCalendarModal, isAdmin } = props;
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
            <TableCell sx={{width: '30px'}}>
                <IconButton onClick={handleBusynessModal.bind(null, object)}>
                    <CalendarMonthIcon/>
                </IconButton>
            </TableCell>
        </TableRow>
        <TableRow>
            <TableCell colSpan={3} sx={{borderBottom: 'none', paddingBottom: 0, paddingTop: 0}}>
                <Collapse in={open} unmountOnExit component={Paper} sx={{marginBlock: 2}}>
                    <Box sx={{ margin: 1 }}>
                    <Typography variant="h6" gutterBottom component="div">
                        {t('common.rooms')}
                    </Typography>
                    <Table size="small" aria-label="purchases" sx={{borderBottom: 'none'}}>
                        <TableHead>
                        <TableRow>
                            <TableCell>{t('common.name')}</TableCell>
                            {isAdmin && <TableCell>{t('dashboard.whoHasAccess')}</TableCell>}
                            {isPremium && (
                                <TableCell/>
                            )}
                        </TableRow>
                        </TableHead>
                        <TableBody>
                            {object.roomTypes.map((room: Room) => (
                                <TableRow key={room.id}>
                                    <TableCell component="th">
                                        {room.name ? room.name : t('dashboard.unnamed')}
                                    </TableCell>
                                    {isAdmin && (
                                        <TableCell>
                                            {room.accessUsers && room.accessUsers.length
                                                ? room.accessUsers.join(', ')
                                                : '—'}
                                        </TableCell>
                                    )}
                                    {isPremium && (
                                        <TableCell align="right">
                                            <IconButton onClick={handleOpenBook.bind(null, {
                                                object: object,
                                                room: room
                                            })}>
                                                <LaunchIcon/>
                                            </IconButton>
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
    const { objects, loading } = useObjects();
    const { data: session } = useSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isAdmin = session?.user && (session.user as any).role === 'admin';
    const [ openBookingModal, setOpenBookingModal ] = useState(false);
    const [ openBusynessCalendarModal, setOpenBusynessCalendarModal ] = useState(false);
    const [ selectedObject, setSelectedObject ] = useState<Object | null>(null);

    const [ selectedRoom, setSelectedRoom ] = useState<{
        object: Object,
        room: Room
    } | null>(null)

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

    const { t } = useTranslation();

    return (
        <>
            <Typography variant='h5' sx={{fontWeight: 600, mb: 2}}>{t('dashboard.myObjects')}</Typography>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell />
                            <TableCell>{t('dashboard.object')}</TableCell>
                            <TableCell />
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
                                isAdmin={!!isAdmin}
                            />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <BookingsModal roomInfo={selectedRoom} open={openBookingModal} setOpen={setOpenBookingModal}/>
            <BusynessCalendarModal object={selectedObject} open={openBusynessCalendarModal} setOpen={setOpenBusynessCalendarModal}/>
        </>
    )
}

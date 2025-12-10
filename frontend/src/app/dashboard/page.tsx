'use client'
import { Box, Collapse, IconButton, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LaunchIcon from '@mui/icons-material/Launch';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

import { useState } from 'react'
import { Object, Room } from '@/lib/types';
import { useObjects } from '@/providers/ObjectsProvider';
import BookingsModal from '@/components/bookingsModal/BookingsModal';
import BusynessCalendarModal from '@/components/busynessCalendarModal/BusynessCalendarModal';

function Row(
    props: { 
        object: Object, 
        setSelectedRoom: (value: { object: Object; room: Room } | null) => void, 
        setOpenBookingModal: (arg0: boolean) => void, 
        setSelectedObject: (arg0: Object | null) => void, 
        setOpenBusynessCalendarModal: (arg0: boolean) => void, 
    }
) {
  const { object, setSelectedRoom, setOpenBookingModal, setSelectedObject, setOpenBusynessCalendarModal } = props;
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
            <TableCell colSpan={6} sx={{borderBottom: 'none', paddingBottom: 0, paddingTop: 0}}>
                <Collapse in={open} unmountOnExit component={Paper} sx={{marginBlock: 2}}>
                    <Box sx={{ margin: 1 }}>
                    <Typography variant="h6" gutterBottom component="div">
                        Комнаты
                    </Typography>
                    <Table size="small" aria-label="purchases" sx={{borderBottom: 'none'}}>
                        <TableHead>
                        <TableRow>
                            <TableCell>Название</TableCell>
                            <TableCell/>
                        </TableRow>
                        </TableHead>
                        <TableBody>
                            {object.roomTypes.map((room: Room) => (
                                <TableRow key={room.id}>
                                    <TableCell component="th">
                                        {room.name ? room.name : 'Unnamed'}
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton onClick={handleOpenBook.bind(null, {
                                            object: object,
                                            room: room
                                        })}>
                                            <LaunchIcon/>
                                        </IconButton>
                                    </TableCell>
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

    return (
        <>
            <Typography variant='h5' sx={{fontWeight: 600, mb: 2}}>Мои объекты</Typography>
            <TableContainer component={Paper}>
                <Table>
                    <TableBody>
                        {objects.map((object: Object) => (
                            <Row 
                                key={object.id} 
                                object={object} 
                                setSelectedRoom={setSelectedRoom} 
                                setOpenBookingModal={setOpenBookingModal} 
                                setSelectedObject={setSelectedObject} 
                                setOpenBusynessCalendarModal={setOpenBusynessCalendarModal}  
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

'use client'
import { Box, Collapse, IconButton, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LaunchIcon from '@mui/icons-material/Launch';

import { useEffect, useState } from 'react'
import { Object, Room } from '@/lib/types';
import { useObjects } from '@/providers/ObjectsProvider';
import BookingsModal from '@/components/bookingsModal/BookingsModal';

function Row(props: { object: Object, setSelectedRoom: (value: { object: Object; room: Room } | null) => void, setOpenBookingModal: (arg0: boolean) => void }, ) {
  const { object, setSelectedRoom, setOpenBookingModal } = props;
  const [open, setOpen] = useState(false);

  const handleOpenBook = (roomInfo: { object: Object; room: Room }) => {
    setSelectedRoom(roomInfo);
    setOpenBookingModal(open);
  }

  return (
    <>
        <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
            <TableCell>
                <IconButton
                    size="small"
                    onClick={() => setOpen(!open)}
                >
                    {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                </IconButton>
            </TableCell>
            <TableCell component="th" scope="row">
                {object.name}
            </TableCell>
            <TableCell align="right">{object.id}</TableCell>
        </TableRow>
        <TableRow>
            <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
            <Collapse in={open} timeout="auto" unmountOnExit>
                <Box sx={{ margin: 1 }}>
                <Typography variant="h6" gutterBottom component="div">
                    Комнаты
                </Typography>
                <Table size="small" aria-label="purchases">
                    <TableHead>
                    <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Название</TableCell>
                    </TableRow>
                    </TableHead>
                    <TableBody>
                        {object.roomTypes.map((room: Room) => (
                            <TableRow key={room.id}>
                                <TableCell component="th">
                                    {room.id}
                                </TableCell>
                                <TableCell component="td" scope="row">
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
    const { objects, loading, refreshObjects } = useObjects();
    const [ openBookingModal, setOpenBookingModal ] = useState(false);

    const [ selectedRoom, setSelectedRoom ] = useState<{
        object: Object,
        room: Room
    } | null>(null)

    useEffect(() => {
        refreshObjects();
    }, [])

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
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                    <TableRow>
                        <TableCell />
                        <TableCell>Название объекта</TableCell>
                        <TableCell align="right">ID</TableCell>
                        <TableCell sx={{width: '30px'}}/>
                    </TableRow>
                    </TableHead>
                    <TableBody>
                        {objects.map((object: Object) => (
                            <Row key={object.id} object={object} setSelectedRoom={setSelectedRoom} setOpenBookingModal={setOpenBookingModal} />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <BookingsModal roomInfo={selectedRoom} open={openBookingModal} setOpen={setOpenBookingModal}/>
        </>
    )
}

'use client'
import { Box, Button, Collapse, Container, Grid, IconButton, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import LogoutIcon from '@mui/icons-material/Logout'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

import { useSession } from 'next-auth/react'
import { handleSignOut } from '../../lib/auth'
import { getObject, getObjects } from '../../lib/beds24/objects'
import { useEffect, useState } from 'react'

interface Room {
    id: number;
    name: string;
}

interface Object {
    id: number;
    name: string;
    roomTypes: Room[];
}

function Row(props: { object: Object }) {
  const { object } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
        <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
            <TableCell>
            <IconButton
                aria-label="expand row"
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
                        <TableCell>Название</TableCell>
                    </TableRow>
                    </TableHead>
                    <TableBody>
                        {object.roomTypes.map((room: Room) => (
                            <TableRow key={room.id}>
                                <TableCell component="th" scope="row">
                                    {room.name}
                                </TableCell>
                                {/* <TableCell>{historyRow.customerId}</TableCell>
                                <TableCell align="right">{historyRow.amount}</TableCell>
                                <TableCell align="right">
                                    {Math.round(historyRow.amount * object.price * 100) / 100}
                                </TableCell> */}
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
    const [objects, setObjects] = useState<Object[]>([]);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const fetchObjects = async () => {
            try {
                setLoading(true);
                const obj = await getObjects();
                console.log(obj);
                if(Array.isArray(obj)) {
                    setObjects(obj);
                }
            } finally {
                setLoading(false); 
            }
        };

        fetchObjects();
         
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
        <TableContainer component={Paper}>
            <Table>
                <TableHead>
                <TableRow>
                    <TableCell />
                    <TableCell>Название объекта</TableCell>
                    <TableCell align="right">Рейтинг</TableCell>
                </TableRow>
                </TableHead>
                <TableBody>
                    {objects.map((object: Object) => (
                        <Row key={object.id} object={object} />
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

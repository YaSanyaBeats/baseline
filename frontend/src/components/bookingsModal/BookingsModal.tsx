'use client'

import { getBookingsPerRoom } from "@/lib/bookings";
import { Booking, InvoiceItem, Object, Room } from "@/lib/types";
import { Dialog, DialogTitle, DialogContent, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useMediaQuery, AppBar, IconButton, Toolbar, Accordion, AccordionDetails, AccordionSummary, Typography, Stack, Box } from "@mui/material"
import { Fragment, useEffect, useMemo, useState } from "react";
import { formatDate, formatTitle } from "@/lib/format";
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
const getMaxInvoice = (invoiceItems: InvoiceItem[]) => {
    let maxInvoice: InvoiceItem | undefined;
    invoiceItems.forEach((invoiceItem) => {
        if(invoiceItem.type != 'charge') {
            return;
        }

        if(!maxInvoice || invoiceItem.lineTotal > maxInvoice.lineTotal) {
            maxInvoice = invoiceItem;
        }
    })

    return maxInvoice;
}

export default function BookingsModal(props: { 
        roomInfo: {object: Object, room: Room} | null, 
        open: boolean, 
        setOpen: (arg0: boolean) => void 
    }) {

    const isMobile = !useMediaQuery('(min-width:768px)');
    const { roomInfo, open, setOpen } = props;
    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<Booking[]>([]);

    const groupedBookings = useMemo(() => {
        const monthMap = new Map<string, { label: string, bookings: Booking[], sortValue: number }>();

        bookings.forEach((booking) => {
            const arrivalDate = new Date(booking.arrival);
            const key = `${arrivalDate.getFullYear()}-${arrivalDate.getMonth()}`;

            if(!monthMap.has(key)) {
                const monthString = arrivalDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
                const label = monthString.charAt(0).toUpperCase() + monthString.slice(1);
                monthMap.set(key, {
                    label,
                    bookings: [],
                    sortValue: arrivalDate.getFullYear() * 12 + arrivalDate.getMonth()
                });
            }

            monthMap.get(key)?.bookings.push(booking);
        });

        return Array.from(monthMap.values()).sort((a, b) => a.sortValue - b.sortValue);
    }, [bookings]);

    useEffect(() => {
        if(!roomInfo) {
            return;
        }

        setLoading(true);
        getBookingsPerRoom(roomInfo).then((bookings) => {
            setBookings(bookings);
            setLoading(false);
        })
        
    }, [roomInfo])

    if(!roomInfo) {
        return;
    }

    const handleClose = () => {
        setOpen(false);
    }

    const getNightsCount = (arrival: string, departure: string) => {
        const oneDay = 1000 * 60 * 60 * 24;
        const arrivalDate = new Date(arrival);
        const departureDate = new Date(departure);

        return Math.max(0, Math.ceil((departureDate.getTime() - arrivalDate.getTime()) / oneDay));
    }

    const getBookingPrice = (booking: Booking) => getMaxInvoice(booking.invoiceItems)?.lineTotal || 0;

    

    return (
        <Dialog
            fullScreen={isMobile}
            open={open}
            onClose={handleClose}
            scroll={'paper'}
            fullWidth={true}
            maxWidth={'lg'}
        >
            <AppBar sx={{ position: 'relative' }}>
                <Toolbar sx={{justifyContent: 'end'}}>
                    <IconButton
                        edge="start"
                        color="inherit"
                        onClick={handleClose}
                    >
                        <CloseIcon />
                    </IconButton>
                </Toolbar>
            </AppBar>
            <DialogTitle>Бронирования 
            </DialogTitle>
            <DialogContent>
                {loading ? (
                    <CircularProgress />
                ) : (
                    !isMobile ? (
                        <Box>
                            {groupedBookings.map((group) => {
                                const totalPrice = group.bookings.reduce((sum, booking) => sum + getBookingPrice(booking), 0);
                                const totalNights = group.bookings.reduce((sum, booking) => sum + getNightsCount(booking.arrival, booking.departure), 0);

                                return (
                                    <TableContainer component={Paper} key={group.label} sx={{mb: 2}}>
                                        <Table sx={{ minWidth: 650 }}>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell colSpan={4} sx={{fontWeight: 700, background: '#f5f5f5'}}>{group.label}</TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell sx={{fontWeight: 'bold', width: '40%'}}>Название</TableCell>
                                                    <TableCell sx={{fontWeight: 'bold', width: '20%'}}>Статус</TableCell>
                                                    <TableCell sx={{fontWeight: 'bold', width: '25%'}}>Период заселения</TableCell>
                                                    <TableCell sx={{fontWeight: 'bold', width: '15%'}}>Стоимость</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {group.bookings.map((booking) => (
                                                    <TableRow
                                                        key={booking.id}
                                                    >
                                                        <TableCell component="th" scope="row" sx={{whiteSpace: 'nowrap'}}>{formatTitle(booking.firstName, booking.lastName, booking.title)}</TableCell>
                                                        <TableCell sx={{whiteSpace: 'nowrap'}}>{booking.status}</TableCell>
                                                        <TableCell sx={{whiteSpace: 'nowrap'}}>
                                                            {formatDate(booking.arrival)} - {formatDate(booking.departure)}
                                                        </TableCell>
                                                        <TableCell sx={{whiteSpace: 'nowrap'}}>{getBookingPrice(booking)} ฿</TableCell>
                                                    </TableRow>
                                                ))}
                                                <TableRow sx={{background: '#fafafa'}}>
                                                    <TableCell sx={{fontWeight: 700}}>Итого</TableCell>
                                                    <TableCell sx={{whiteSpace: 'nowrap'}}>Бронирований: {group.bookings.length}</TableCell>
                                                    <TableCell sx={{whiteSpace: 'nowrap'}}>Ночей: {totalNights}</TableCell>
                                                    <TableCell sx={{whiteSpace: 'nowrap', fontWeight: 700}}>{totalPrice} ฿</TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )
                            })}
                        </Box>
                    ): (
                        <>
                            {groupedBookings.map((group, index) => {
                                const totalPrice = group.bookings.reduce((sum, booking) => sum + getBookingPrice(booking), 0);
                                const totalNights = group.bookings.reduce((sum, booking) => sum + getNightsCount(booking.arrival, booking.departure), 0);

                                return (
                                    <Paper key={group.label} elevation={5} sx={{ mb: index < groupedBookings.length - 1 ? 3 : 0, p: 2 }}>
                                        <Typography variant="h6" sx={{fontWeight: 700, mb: 2}}>{group.label}</Typography>
                                        {group.bookings.map((booking) => (
                                            <Accordion key={booking.id}>
                                                <AccordionSummary
                                                    expandIcon={<ExpandMoreIcon />}
                                                >
                                                    <Typography component="span">{formatTitle(booking.firstName, booking.lastName, booking.title)}</Typography>
                                                </AccordionSummary>
                                                <AccordionDetails>
                                                    <Stack direction={'row'} justifyContent={'space-between'} sx={{borderBottom: '1px solid #00000030', paddingBlock: 1}}>
                                                        <Typography sx={{fontWeight: 600}}>Статус:</Typography>
                                                        <Typography>{booking.status}</Typography>
                                                    </Stack>
                                                    <Stack direction={'row'} justifyContent={'space-between'} sx={{borderBottom: '1px solid #00000030', paddingBlock: 1}}>
                                                        <Typography sx={{fontWeight: 600}}>Дата заезда:</Typography>
                                                        <Typography>{formatDate(booking.arrival)}</Typography>
                                                    </Stack>
                                                    <Stack direction={'row'} justifyContent={'space-between'} sx={{borderBottom: '1px solid #00000030', paddingBlock: 1}}>
                                                        <Typography sx={{fontWeight: 600}}>Дата выезда:</Typography>
                                                        <Typography>{formatDate(booking.departure)}</Typography>
                                                    </Stack>
                                                    <Stack direction={'row'} justifyContent={'space-between'} sx={{paddingBlock: 1}}>
                                                        <Typography sx={{fontWeight: 600}}>Стоимость:</Typography>
                                                        <Typography>{getBookingPrice(booking)} ฿</Typography>
                                                    </Stack>
                                                </AccordionDetails>
                                            </Accordion>
                                        ))}
                                        <Stack direction={'row'} justifyContent={'space-between'} sx={{mt: 1, padding: 1, background: '#eaeaea', borderRadius: 1}}>
                                            <Typography sx={{fontWeight: 700}}>Итого</Typography>
                                            <Stack alignItems={'flex-end'}>
                                                <Typography>Бронирований: {group.bookings.length}</Typography>
                                                <Typography>Ночей: {totalNights}</Typography>
                                                <Typography sx={{fontWeight: 700}}>Сумма: {totalPrice} ฿</Typography>
                                            </Stack>
                                        </Stack>
                                    </Paper>
                                )
                            })}
                        </>
                    )
                )}
            </DialogContent>
        </Dialog>
    )
    
}
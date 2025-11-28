'use client'

import { getBookingsPerRoom } from "@/lib/bookings";
import { Booking, InvoiceItem, Object, Room } from "@/lib/types";
import { Dialog, DialogTitle, DialogContent, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material"
import { useEffect, useState } from "react";
import { formatDate, formatTitle } from "@/lib/format";

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

    const { roomInfo, open, setOpen } = props;
    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<Booking[]>([]);

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

    

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            scroll={'paper'}
            fullWidth={true}
            maxWidth={'lg'}
        >
            <DialogTitle>Бронирования 
            </DialogTitle>
            <DialogContent>
                {loading ? (
                    <CircularProgress />
                ) : (
                    <TableContainer component={Paper}>
                        <Table sx={{ minWidth: 650 }} aria-label="simple table">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{fontWeight: 'bold'}}>Название</TableCell>
                                    <TableCell sx={{fontWeight: 'bold'}}>Статус</TableCell>
                                    <TableCell sx={{fontWeight: 'bold'}}>Период заселения</TableCell>
                                    <TableCell sx={{fontWeight: 'bold'}}>Стоимость</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {bookings.map((booking) => (
                                    <TableRow
                                        key={booking.id}
                                    >
                                        <TableCell component="th" scope="row" sx={{whiteSpace: 'nowrap'}}>{formatTitle(booking.firstName, booking.lastName, booking.title)}</TableCell>
                                        <TableCell sx={{whiteSpace: 'nowrap'}}>{booking.status}</TableCell>
                                        <TableCell sx={{whiteSpace: 'nowrap'}}>
                                            {formatDate(booking.arrival)} - {formatDate(booking.departure)}
                                        </TableCell>
                                        <TableCell sx={{whiteSpace: 'nowrap'}}>{getMaxInvoice(booking.invoiceItems)?.lineTotal || 0} ฿</TableCell>
                                    </TableRow>
                                ))}

                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </DialogContent>
        </Dialog>
    )
    
}
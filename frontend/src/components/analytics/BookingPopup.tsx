import { AnalyticsBooking } from "@/lib/types";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton } from "@mui/material";
import Link from "next/link";
import React from "react";
import LaunchIcon from '@mui/icons-material/Launch';

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const formattedDate = date.toLocaleDateString('ru-RU').replace(/\./g, '.');
    return formattedDate;
}

const formatTitle = (firstName: string, lastName: string, title: string) => {
    if(title) {
        title = `(${title})`;
    }


    return [firstName, lastName, title].join(' ');
}

export default function BookingPopup(props: { open: boolean, bookings: AnalyticsBooking[], onClose: () => void }) {
    const { open, bookings, onClose } = props;

    const handleClose = () => {
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            scroll={'paper'}
            fullWidth={true}
            maxWidth={'lg'}
        >
            <DialogTitle>Бронирования за период для объекта</DialogTitle>
            <DialogContent dividers={true}>
                <TableContainer component={Paper}>
                    <Table sx={{ minWidth: 650 }} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{fontWeight: 'bold'}}>Название</TableCell>
                                <TableCell sx={{fontWeight: 'bold'}}>Статус</TableCell>
                                <TableCell sx={{fontWeight: 'bold'}}>Период заселения</TableCell>
                                <TableCell sx={{fontWeight: 'bold'}}>Стоимость</TableCell>
                                <TableCell></TableCell>
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
                                    <TableCell sx={{whiteSpace: 'nowrap'}}>{booking.price} ฿</TableCell>
                                    <TableCell>
                                        <Link target="_blank" href={`https://beds24.com/control2.php?ajax=bookedit&id=${booking.id}&tab=1`}>
                                            <IconButton>
                                                <LaunchIcon color="primary"></LaunchIcon>
                                            </IconButton>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}

                        </TableBody>
                    </Table>
                </TableContainer>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Закрыть</Button>
            </DialogActions>
        </Dialog>
    );
}
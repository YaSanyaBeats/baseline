import { AnalyticsBooking } from "@/lib/types";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton } from "@mui/material";
import Link from "next/link";
import React from "react";
import LaunchIcon from '@mui/icons-material/Launch';
import { formatDate, formatTitle } from "@/lib/format";
import { useTranslation } from "@/i18n/useTranslation";

export default function BookingPopup(props: { open: boolean, bookings: AnalyticsBooking[], onClose: () => void }) {
    const { open, bookings, onClose } = props;
    const { t } = useTranslation();

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
            <DialogTitle>{t('analytics.bookingsForPeriod')}</DialogTitle>
            <DialogContent dividers={true}>
                <TableContainer component={Paper}>
                    <Table sx={{ minWidth: 650 }} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{fontWeight: 'bold'}}>{t('common.name')}</TableCell>
                                <TableCell sx={{fontWeight: 'bold'}}>{t('common.status')}</TableCell>
                                <TableCell sx={{fontWeight: 'bold'}}>{t('common.period')}</TableCell>
                                <TableCell sx={{fontWeight: 'bold'}}>{t('common.price')}</TableCell>
                                <TableCell sx={{fontWeight: 'bold'}}>{t('analytics.referer')}</TableCell>
                                <TableCell sx={{fontWeight: 'bold'}}>{t('analytics.bookingDate')}</TableCell>
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
                                    <TableCell sx={{whiteSpace: 'nowrap'}}>{booking.referer ?? '—'}</TableCell>
                                    <TableCell sx={{whiteSpace: 'nowrap'}}>{formatDate(booking.bookingTime)}</TableCell>
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
                <Button onClick={handleClose}>{t('common.close')}</Button>
            </DialogActions>
        </Dialog>
    );
}
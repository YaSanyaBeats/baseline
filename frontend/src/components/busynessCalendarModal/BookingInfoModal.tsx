'use client';

import { BusynessBookingInfo } from "@/lib/types";
import { 
    Dialog, 
    DialogTitle, 
    DialogContent, 
    DialogActions, 
    Button, 
    Stack, 
    Typography,
    IconButton,
    Box
} from "@mui/material";
import Link from "next/link";
import LaunchIcon from '@mui/icons-material/Launch';
import { formatDate, formatTitle } from "@/lib/format";
import { useUser } from "@/providers/UserProvider";

interface BookingInfoModalProps {
    open: boolean;
    booking: BusynessBookingInfo | null;
    onClose: () => void;
}

export default function BookingInfoModal({ open, booking, onClose }: BookingInfoModalProps) {
    const { isAdmin, isPremium } = useUser();

    const handleClose = () => {
        onClose();
    };

    const getNightsCount = (arrival: string, departure: string) => {
        const oneDay = 1000 * 60 * 60 * 24;
        const arrivalDate = new Date(arrival);
        const departureDate = new Date(departure);
        return Math.max(0, Math.ceil((departureDate.getTime() - arrivalDate.getTime()) / oneDay));
    };

    if (!booking) {
        return null;
    }

    return (
        <Dialog
            open={open && !!booking}
            onClose={handleClose}
            scroll={'paper'}
            fullWidth={true}
            maxWidth={'sm'}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Информация о бронировании</span>
                {isAdmin && (
                    <Link target="_blank" href={`https://beds24.com/control2.php?ajax=bookedit&id=${booking.id}&tab=1`}>
                        <IconButton size="small">
                            <LaunchIcon color="primary" />
                        </IconButton>
                    </Link>
                )}
            </DialogTitle>
            <DialogContent dividers={true}>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}>
                            Название
                        </Typography>
                        <Typography variant="body1">
                            {formatTitle(booking.firstName, booking.lastName, booking.title)}
                        </Typography>
                    </Box>

                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}>
                            Статус
                        </Typography>
                        <Typography variant="body1">
                            {booking.status}
                        </Typography>
                    </Box>

                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}>
                            Дата заезда
                        </Typography>
                        <Typography variant="body1">
                            {formatDate(booking.arrival)}
                        </Typography>
                    </Box>

                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}>
                            Дата выезда
                        </Typography>
                        <Typography variant="body1">
                            {formatDate(booking.departure)}
                        </Typography>
                    </Box>

                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}>
                            Количество ночей
                        </Typography>
                        <Typography variant="body1">
                            {getNightsCount(booking.arrival, booking.departure)}
                        </Typography>
                    </Box>

                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}>
                            Количество гостей
                        </Typography>
                        <Typography variant="body1">
                            {booking.guestsCount}
                        </Typography>
                    </Box>

                    {isPremium && (
                        <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}>
                                Стоимость
                            </Typography>
                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                {booking.price} ฿
                            </Typography>
                        </Box>
                    )}
                    
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Закрыть</Button>
            </DialogActions>
        </Dialog>
    );
}


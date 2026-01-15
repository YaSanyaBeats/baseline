import { Dialog, DialogTitle, DialogContent, CircularProgress, Stack, Box, IconButton, Typography, AppBar, Toolbar, useMediaQuery } from "@mui/material";
import { RoomBookings, BusynessRow, BusynessItem, BusynessBookingInfo, Object } from '@/lib/types';
import { useEffect, useState } from "react";
import { getBusynessPerDays } from "@/lib/bysuness";
import BusynessCalendarTable from "./BusynessCalendarTable";
import BusynessCalendarMobile from "./BusynessCalendarMobile";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useSession } from "next-auth/react";
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from "@/i18n/useTranslation";

const getDaysInMonth = (year: number, month: number): Date[] => {
    const days: Date[] = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        
        days.push(new Date(d));
    }
    
    return days;
};

const getBookingForDate = (date: string, bookings: BusynessBookingInfo[]): BusynessBookingInfo | null => {
    return bookings.find(booking => {
        return date >= booking.arrival && date < booking.departure;
    }) || null;
};

const getBusynessItemsPage = (roomBookings: RoomBookings[], page: number): BusynessRow[] => {
    if(!roomBookings.length) {
        return [];
    }

    const now = new Date();
    now.setDate(1);
    const targetDate = new Date(now);
    targetDate.setMonth(now.getMonth() - 12 + page);
    
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const days = getDaysInMonth(year, month);

    const result: BusynessRow[] = [];
    
    roomBookings.forEach((roomBooking) => {
        const busynessItems: BusynessItem[] = days.map(day => {

            const year = day.getFullYear();
            const month = String(day.getMonth() + 1).padStart(2, '0');
            const dayOfMonth = String(day.getDate()).padStart(2, '0');
            const dateString = `${year}-${month}-${dayOfMonth}`;
            const booking = getBookingForDate(dateString, roomBooking.bookings);
            
            
            if (booking) {
                return {
                    date: dateString,
                    busyness: booking.status === 'black' ? 'black' : 'busyness',
                    booking: booking
                };
            } else {
                return {
                    date: dateString,
                    busyness: 'free',
                    booking: null
                };
            }
        });

        result.push({
            roomID: roomBooking.roomID,
            roomName: roomBooking.roomName,
            busyness: busynessItems
        });
    });

    return result;
}

const getCurrentMonth = (page: number, t: (key: string) => string) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - 12 + page);
    
    const monthKeys = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthKey = monthKeys[date.getMonth()];
    
    return `${t(`calendar.months.${monthKey}`)} ${date.getFullYear()}`;
}

export default function BusynessCalendarModal(props: { 
        object: Object| null, 
        open: boolean, 
        setOpen: (arg0: boolean) => void 
    }) {

    const isMobile = !useMediaQuery('(min-width:768px)');
    const { object, open, setOpen } = props;
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [roomBookings, setRoomBookings] = useState<RoomBookings[]>([]);
    // 12-й "шаг" соответствует текущему месяцу (смещение -12 + page)
    const [page, setPage] = useState(12);
    const {data: session} = useSession();

    const handleClose = () => {
        setOpen(false);
    }

    const nextPage = () => {
        setPage(page + 1);
    }

    const prevPage = () => {
        setPage(page - 1);
    }

    useEffect(() => {
        if(!object) {
            return;
        }

        setLoading(true);
        getBusynessPerDays(object, session).then((bookings: RoomBookings[]) => {
            setRoomBookings(bookings);
            setLoading(false);
            // по умолчанию показываем текущий месяц
            setPage(12);
        })
    }, [object, session])

    if(!object) {
        return;
    }

    if(!roomBookings.length) {
        return;
    }

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
            <DialogTitle>
                <Stack direction={{xs: 'column', sm: 'row'}} spacing={1} justifyContent={'space-between'} alignItems={'end'}>
                    <Box>{t('calendar.bookings')} {object.name} ({getCurrentMonth(page, t)})</Box>
                    <Stack direction={'row'}>
                        <IconButton disabled={page === 0} onClick={prevPage}>
                            <ArrowBackIcon/>
                        </IconButton>
                        <IconButton disabled={page === 15} onClick={nextPage}>
                            <ArrowForwardIcon/>
                        </IconButton>
                    </Stack>
                </Stack>
            </DialogTitle>
            <DialogContent>
                {loading ? (
                    <CircularProgress />
                ) : (
                    <>
                        {isMobile ? (
                            <BusynessCalendarMobile busynessItems={getBusynessItemsPage(roomBookings, page)} />
                        ) : (
                            <BusynessCalendarTable busynessItems={getBusynessItemsPage(roomBookings, page)} />
                        )}
                        <Stack direction={{xs: 'column', sm: 'row'}} mt={3} spacing={{xs: 2, sm: 3}}>
                            <Stack direction={'row'} alignItems={'center'} spacing={1}>
                                <Box sx={{width: '20px', height: '20px', background: 'white', border: '1px solid rgba(12, 12, 12, 0.5)'}}></Box>
                                <Typography>- {t('common.free')}</Typography>
                            </Stack>
                            <Stack direction={'row'} alignItems={'center'} spacing={1}>
                                <Box sx={{width: '20px', height: '20px', background: '#1976D2', border: '1px solid rgba(12, 12, 12, 0.5)'}}></Box>
                                <Typography>- {t('common.busy')}</Typography>
                            </Stack>
                            <Stack direction={'row'} alignItems={'center'} spacing={1}>
                                <Box sx={{width: '20px', height: '20px', background: 'black', border: '1px solid rgba(12, 12, 12, 0.5)'}}></Box>
                                <Typography>- {t('common.closed')}</Typography>
                            </Stack>
                        </Stack>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )

}
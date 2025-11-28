import { Dialog, DialogTitle, DialogContent, CircularProgress, Stack, Box, IconButton, Typography } from "@mui/material";
import { BusynessRow, Object } from '@/lib/types';
import { useEffect, useState } from "react";
import { getBusynessPerDays } from "@/lib/bysuness";
import BusynessCalendarTable from "./BusynessCalendarTable";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const getBusynessItemsPage = (busynessRooms: BusynessRow[], page: number) => {
    if(!busynessRooms.length || !busynessRooms[0].busyness.length) {
        return [];
    }

    const firstDate = new Date(busynessRooms[0].busyness[0].date);
    firstDate.setMonth(firstDate.getMonth() + page);

    const firstDateString = firstDate.toISOString().split('T')[0];
    const datePath = firstDateString.split('-').slice(0, 2).join('-');

    const result = [] as BusynessRow[];
    busynessRooms.forEach((busynessRoom) => {
        const filteredItems = busynessRoom.busyness.filter((item) => {
            return item.date.includes(datePath);
        });

        result.push({
            ...busynessRoom,
            busyness: filteredItems
        })
    })

    return result;
}

const getCurrentMonth = (page: number) => {
    const date = new Date();
    date.setMonth(date.getMonth() - 12 + page);
    date.setDate(1);
    return date.toISOString().split('T')[0];
}

export default function BusynessCalendarModal(props: { 
        object: Object| null, 
        open: boolean, 
        setOpen: (arg0: boolean) => void 
    }) {

    const { object, open, setOpen } = props;
    const [loading, setLoading] = useState(true);
    const [busynessItems, setBusynessItems] = useState<BusynessRow[]>([]);
    const [page, setPage] = useState(0);

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
        getBusynessPerDays(object).then((bysuness: BusynessRow[]) => {
            setBusynessItems(bysuness);
            setLoading(false);
            setPage(0);
        })
    }, [object])

    if(!object) {
        return;
    }

    if(!busynessItems.length || !busynessItems[0].busyness.length) {
        return;
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            scroll={'paper'}
            fullWidth={true}
            maxWidth={'lg'}
        >
            <DialogTitle>
                <Stack direction={'row'} justifyContent={'space-between'}>
                    <Box>Бронирования {object.name} за период {getCurrentMonth(page)}</Box>
                    <Box>
                        <IconButton disabled={page === 0} onClick={prevPage}>
                            <ArrowBackIcon/>
                        </IconButton>
                        <IconButton disabled={page === 15} onClick={nextPage}>
                            <ArrowForwardIcon/>
                        </IconButton>
                    </Box>
                </Stack>
            </DialogTitle>
            <DialogContent>
                {loading ? (
                    <CircularProgress />
                ) : (
                    <>
                        <BusynessCalendarTable busynessItems={getBusynessItemsPage(busynessItems, page)}></BusynessCalendarTable>
                        <Stack direction={'row'} mt={2} spacing={3}>
                            <Stack direction={'row'} alignItems={'center'} spacing={1}>
                                <Box sx={{width: '20px', height: '20px', background: '#fff1f1ff', border: '1px solid rgba(12, 12, 12, 0.5)'}}></Box>
                                <Typography>- Занято</Typography>
                            </Stack>
                            <Stack direction={'row'} alignItems={'center'} spacing={1}>
                                <Box sx={{width: '20px', height: '20px', background: 'white', border: '1px solid rgba(12, 12, 12, 0.5)'}}></Box>
                                <Typography>- Свободно</Typography>
                            </Stack>
                        </Stack>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )

}
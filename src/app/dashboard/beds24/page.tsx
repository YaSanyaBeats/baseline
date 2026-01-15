'use client'
import { syncObjects, syncPrices, syncBookings, getLastSyncTimes } from "@/lib/beds24/objects"
import { useSnackbar } from "@/providers/SnackbarContext";
import { Button, Stack, Typography, Box } from "@mui/material"
import React from "react";

interface SyncTimes {
    objects: string | null;
    prices: string | null;
    bookings: string | null;
}



export default function Page() {
    const { setSnackbar } = useSnackbar();
    
    const [loadObjects, setLoadObjects] = React.useState(false);
    const [loadPrices, setLoadPrices] = React.useState(false);
    const [loadBookings, setLoadBookings] = React.useState(false);
    const [syncTimes, setSyncTimes] = React.useState<SyncTimes>({
        objects: null,
        prices: null,
        bookings: null
    });

    React.useEffect(() => {
        loadSyncTimes();
    }, []);

    const loadSyncTimes = async () => {
        try {
            const res = await getLastSyncTimes();
            if (res.success && res.data) {
                setSyncTimes({
                    objects: res.data.objects || null,
                    prices: res.data.prices || null,
                    bookings: res.data.bookings || null
                });
            }
        } catch (error) {
            console.error('Error loading sync times:', error);
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Никогда';
        const date = new Date(dateString);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleSyncObjects = () => {
        setLoadObjects(true);
        syncObjects().then((res) => {
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            setLoadObjects(false);
            if (res.success) {
                loadSyncTimes();
            }
        });
    }

    const handleSyncPrices = () => {
        setLoadPrices(true);
        syncPrices().then((res) => {
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            setLoadPrices(false);
            if (res.success) {
                loadSyncTimes();
            }
        });
    }

    const handleSyncBookings = () => {
        setLoadBookings(true);
        syncBookings().then((res) => {
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            setLoadBookings(false);
            if (res.success) {
                loadSyncTimes();
            }
        });
    }
  
    return (
        <>
            <Stack spacing={3}>
                <Stack spacing={2} direction={'row'} flexWrap="wrap">
                    <Box>
                        <Button onClick={handleSyncObjects} variant="contained" loading={loadObjects}>
                            Sync Objects
                        </Button>
                        <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 0.5 }}>
                            Последняя синхронизация: {formatDate(syncTimes.objects)}
                        </Typography>
                    </Box>
                    <Box>
                        <Button onClick={handleSyncPrices} variant="contained" loading={loadPrices}>
                            Sync Prices
                        </Button>
                        <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 0.5 }}>
                            Последняя синхронизация: {formatDate(syncTimes.prices)}
                        </Typography>
                    </Box>
                    <Box>
                        <Button onClick={handleSyncBookings} variant="contained" loading={loadBookings}>
                            Sync Bookings
                        </Button>
                        <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 0.5 }}>
                            Последняя синхронизация: {formatDate(syncTimes.bookings)}
                        </Typography>
                    </Box>
                </Stack>
            </Stack>
        </>
    )
}

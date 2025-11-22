'use client'
import { syncObjects, syncPrices, syncBookings } from "@/lib/beds24/objects"
import { useSnackbar } from "@/providers/SnackbarContext";
import { Button, Stack } from "@mui/material"
import React from "react";



export default function Page() {
    const { snackbar, setSnackbar } = useSnackbar();
    
    const [loadObjects, setLoadObjects] = React.useState(false);
    const [loadPrices, setLoadPrices] = React.useState(false);
    const [loadBookings, setLoadBookings] = React.useState(false);
    

    const handleSyncObjects = () => {
        setLoadObjects(true);
        syncObjects().then((res) => {
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            setLoadObjects(false);
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
        });
    }
  
    return (
        <>
            <Stack spacing={2} direction={'row'}>
                <Button onClick={handleSyncObjects} variant="contained" loading={loadObjects}>Sync Objects</Button>
                <Button onClick={handleSyncPrices} variant="contained" loading={loadPrices}>Sync Prices</Button>
                <Button onClick={handleSyncBookings} variant="contained" loading={loadBookings}>Sync Bookings</Button>
            </Stack>
        </>
    )
}

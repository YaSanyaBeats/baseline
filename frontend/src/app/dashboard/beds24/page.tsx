'use client'
import { syncObjects, syncPrices, syncBookings } from "@/lib/beds24/objects"
import { Alert, Button, Snackbar, Stack } from "@mui/material"
import React from "react";



export default function Page() {
    const [snackBarOptions, setSnackBarOptions] = React.useState({
        open: false,
        message: '',
        severity: 'success' as 'success' | 'info' | 'warning' | 'error'
    })
    
    const [loadObjects, setLoadObjects] = React.useState(false);
    const [loadPrices, setLoadPrices] = React.useState(false);
    const [loadBookings, setLoadBookings] = React.useState(false);
    

    const handleSyncObjects = () => {
        setLoadObjects(true);
        syncObjects().then((res) => {
            setSnackBarOptions({
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
            setSnackBarOptions({
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
            setSnackBarOptions({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            setLoadBookings(false);
        });
    }

    const handleClose = () => {
        setSnackBarOptions({
            ...snackBarOptions,
            open: false
        });
    }
  
    return (
        <>
            <Stack spacing={2} direction={'row'}>
                <Button onClick={handleSyncObjects} variant="contained" loading={loadObjects}>Sync Objects</Button>
                <Button onClick={handleSyncPrices} variant="contained" loading={loadPrices}>Sync Prices</Button>
                <Button onClick={handleSyncBookings} variant="contained" loading={loadBookings}>Sync Bookings</Button>
            </Stack>
            <Snackbar 
                open={snackBarOptions.open} 
                autoHideDuration={6000} 
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert
                    onClose={handleClose}
                    severity={snackBarOptions.severity}
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    {snackBarOptions.message}
                </Alert>
            </Snackbar>
        </>
    )
}

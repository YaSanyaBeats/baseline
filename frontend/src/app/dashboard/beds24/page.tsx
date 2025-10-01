'use client'
import { getObjects, getObject, syncObjects, syncBookings, syncPrices } from "@/lib/beds24/objects"
import { Button, Snackbar, Stack } from "@mui/material"
import React from "react";



export default function Page() {
    const [open, setOpen] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [loadObjects, setLoadObjects] = React.useState(false);
    const [loadPrices, setLoadPrices] = React.useState(false);
    const [loadBookings, setLoadBookings] = React.useState(false);
    

    const handleSyncObjects = () => {
        syncObjects();
        setLoadObjects(true);
        setTimeout(() => {
            setMessage('Обновлено 0 объектов');
            setLoadObjects(false);
            setOpen(true);
        }, 3000);
        
    }

    const handleSyncPrices = () => {
        syncObjects();
        setLoadPrices(true);
        setTimeout(() => {
            setMessage('Обновлено 0 ценовых периодов');
            setLoadPrices(false);
            setOpen(true);
        }, 3000);
    }

    const handleSyncBookings = () => {
        syncObjects();
        setLoadBookings(true);
        setTimeout(() => {
            setMessage('Обновлено 0 новых бронирований');
            setLoadBookings(false);
            setOpen(true);
        }, 3000);
    }
  
    return (
        <>
            <Stack spacing={2} direction={'row'}>
                <Button onClick={handleSyncObjects} variant="contained" loading={loadObjects}>Sync Objects</Button>
                <Button onClick={handleSyncPrices} variant="contained" loading={loadPrices}>Sync Prices</Button>
                <Button onClick={handleSyncBookings} variant="contained" loading={loadBookings}>Sync Bookings</Button>
            </Stack>
            <Snackbar
                open={open}
                autoHideDuration={6000}
                message={message}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            />
        </>
    )
}

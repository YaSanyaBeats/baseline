'use client'
import { getObjects, getObject, syncObjects, syncBookings, syncPrices } from "@/lib/beds24/objects"
import { Button, Stack } from "@mui/material"

export default function Page() {
    return (
        <Stack spacing={2} direction={'row'}>
            <Button onClick={syncObjects} variant="contained">Sync Objects</Button>
            <Button onClick={syncPrices} variant="contained">Sync Prices</Button>
            <Button onClick={syncBookings} variant="contained">Sync Bookings</Button>
        </Stack>
    )
}

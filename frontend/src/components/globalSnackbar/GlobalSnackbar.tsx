'use client'

import { useSnackbar } from "@/providers/SnackbarContext";
import { Snackbar, Alert } from "@mui/material";

export default function GlobalSnackbar() {
    const { snackbar, setSnackbar } = useSnackbar();
    const handleClose = () => {
        setSnackbar({
            ...snackbar,
            open: false
        });
    }

    return (
        <Snackbar 
            open={snackbar.open} 
            autoHideDuration={6000} 
            onClose={handleClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
            <Alert
                onClose={handleClose}
                severity={snackbar.severity}
                variant="filled"
                sx={{ width: '100%' }}
            >
                {snackbar.message}
            </Alert>
        </Snackbar>
    )
}
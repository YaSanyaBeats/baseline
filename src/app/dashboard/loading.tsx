'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';

export default function DashboardLoading() {
    return (
        <Box sx={{ width: '100%' }}>
            <LinearProgress
                sx={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 9999,
                    '& .MuiLinearProgress-bar': {
                        animationDuration: '1.5s',
                    },
                }}
            />
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '60vh',
                    width: '100%',
                }}
            >
                <CircularProgress size={48} />
            </Box>
        </Box>
    );
}

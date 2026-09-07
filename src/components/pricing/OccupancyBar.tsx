'use client';

import { Box, Typography } from '@mui/material';

export function OccupancyBar({ value }: { value: number }) {
    const occ = Math.max(0, Math.min(100, value));
    const color = occ >= 70 ? 'success.main' : occ >= 45 ? 'warning.main' : 'error.main';
    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, minWidth: 140 }}>
            <Box sx={{ width: 90, height: 8, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
                <Box sx={{ width: `${occ}%`, height: '100%', bgcolor: color }} />
            </Box>
            <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
                {Math.round(occ)}%
            </Typography>
        </Box>
    );
}

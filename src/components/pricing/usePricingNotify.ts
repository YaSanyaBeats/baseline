'use client';

import { useCallback } from 'react';
import { useSnackbar } from '@/providers/SnackbarContext';

export function usePricingNotify() {
    const { setSnackbar } = useSnackbar();
    return useCallback(
        (message: string, severity: 'success' | 'error' | 'warning' | 'info' = 'info') => {
            setSnackbar({ open: true, message, severity });
        },
        [setSnackbar],
    );
}

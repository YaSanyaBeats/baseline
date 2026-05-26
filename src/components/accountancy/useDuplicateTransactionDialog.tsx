'use client';

import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from '@mui/material';
import { useCallback, useRef, useState } from 'react';
import type { DuplicateConflictChoice, DuplicateConflictInfo } from '@/lib/accountancyDuplicateSubmit';
import { useTranslation } from '@/i18n/useTranslation';

export function useDuplicateTransactionDialog() {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [info, setInfo] = useState<DuplicateConflictInfo | null>(null);
    const resolveRef = useRef<((choice: DuplicateConflictChoice) => void) | null>(null);

    const askOnDuplicate = useCallback((conflict: DuplicateConflictInfo): Promise<DuplicateConflictChoice> => {
        return new Promise((resolve) => {
            resolveRef.current = resolve;
            setInfo(conflict);
            setOpen(true);
        });
    }, []);

    const closeWith = useCallback((choice: DuplicateConflictChoice) => {
        setOpen(false);
        setInfo(null);
        resolveRef.current?.(choice);
        resolveRef.current = null;
    }, []);

    const DuplicateDialog = (
        <Dialog open={open} onClose={() => closeWith('skip')} maxWidth="sm" fullWidth>
            <DialogTitle>{t('accountancy.duplicateTransactionTitle')}</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {t('accountancy.duplicateTransactionMessage')
                        .replace('{category}', info?.category ?? '')
                        .replace('{amount}', String(info?.existingLineTotal ?? info?.existingAmount ?? 0))}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => closeWith('skip')}>{t('accountancy.duplicateTransactionSkip')}</Button>
                <Button variant="contained" onClick={() => closeWith('add')}>
                    {t('accountancy.duplicateTransactionAdd')}
                </Button>
            </DialogActions>
        </Dialog>
    );

    return { askOnDuplicate, DuplicateDialog };
}

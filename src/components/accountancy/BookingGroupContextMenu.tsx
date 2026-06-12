'use client';

import { useCallback, useMemo, useState } from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    ListItemText,
    Menu,
    MenuItem,
} from '@mui/material';
import { ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { useTranslation } from '@/i18n/useTranslation';
import type { AccountancyOverviewOperationRowModel } from '@/components/accountancy/AccountancyOverviewOperationTableRow';

export type BookingGroupContextMenuState = {
    mouseX: number;
    mouseY: number;
    /** Задан только для групп бронирований (`b-{id}`). */
    bookingId?: number;
    groupLabel: string;
    rows: AccountancyOverviewOperationRowModel[];
};

type MoveConfirmState = {
    targetMonth: string;
    targetMonthLabel: string;
    groupLabel: string;
    rows: AccountancyOverviewOperationRowModel[];
};

type BookingGroupContextMenuProps = {
    menuState: BookingGroupContextMenuState | null;
    onCloseMenu: () => void;
    sourcePeriodLabel: string;
    reportMonthOptions: { value: string; label: string }[];
    isTargetMonthDisabled: (targetMonth: string) => boolean;
    isMoveDisabled: boolean;
    onMove: (rows: AccountancyOverviewOperationRowModel[], targetMonth: string) => Promise<void>;
    isConfirmAllDisabled: boolean;
    onConfirmAll: (rows: AccountancyOverviewOperationRowModel[]) => Promise<void>;
};

function getMovableRows(rows: AccountancyOverviewOperationRowModel[]): AccountancyOverviewOperationRowModel[] {
    return rows.filter(
        (r) => !r.readOnlySynthetic && !r.isPendingDraft && !!r.entityId,
    );
}

function getConfirmableRows(rows: AccountancyOverviewOperationRowModel[]): AccountancyOverviewOperationRowModel[] {
    return rows.filter(
        (r) => !r.readOnlySynthetic && (r.isPendingDraft || !!r.entityId),
    );
}

function getRowsNeedingConfirm(rows: AccountancyOverviewOperationRowModel[]): AccountancyOverviewOperationRowModel[] {
    return getConfirmableRows(rows).filter((r) => r.status !== 'confirmed');
}

const compactMenuPaperSx = {
    minWidth: 0,
    boxShadow: 2,
    '& .MuiList-root': {
        py: 0.25,
    },
};

const compactMenuItemSx = {
    py: 0.25,
    px: 0.75,
    minHeight: 24,
    fontSize: '0.6875rem',
    lineHeight: 1.2,
};

const compactListItemTextProps = {
    primaryTypographyProps: {
        fontSize: '0.6875rem',
        lineHeight: 1.2,
    },
};

export function BookingGroupContextMenu({
    menuState,
    onCloseMenu,
    sourcePeriodLabel,
    reportMonthOptions,
    isTargetMonthDisabled,
    isMoveDisabled,
    onMove,
    isConfirmAllDisabled,
    onConfirmAll,
}: BookingGroupContextMenuProps) {
    const { t } = useTranslation();
    const [submenuAnchor, setSubmenuAnchor] = useState<HTMLElement | null>(null);
    const [moveConfirm, setMoveConfirm] = useState<MoveConfirmState | null>(null);
    const [moving, setMoving] = useState(false);
    const [confirmingAll, setConfirmingAll] = useState(false);

    const isBookingGroup = menuState?.bookingId != null;

    const movableRows = useMemo(
        () => (menuState ? getMovableRows(menuState.rows) : []),
        [menuState],
    );

    const rowsNeedingConfirm = useMemo(
        () => (menuState ? getRowsNeedingConfirm(menuState.rows) : []),
        [menuState],
    );

    const confirmMovableRows = useMemo(
        () => (moveConfirm ? getMovableRows(moveConfirm.rows) : []),
        [moveConfirm],
    );

    const rowsToMoveCount = useMemo(() => {
        if (!moveConfirm) return 0;
        return confirmMovableRows.filter(
            (r) => (r.reportMonth ?? '').trim() !== moveConfirm.targetMonth,
        ).length;
    }, [moveConfirm, confirmMovableRows]);

    const handleCloseAll = useCallback(() => {
        setSubmenuAnchor(null);
        onCloseMenu();
    }, [onCloseMenu]);

    const handleSelectTargetMonth = (targetMonth: string, targetMonthLabel: string) => {
        if (!menuState) return;
        setSubmenuAnchor(null);
        onCloseMenu();
        setMoveConfirm({
            targetMonth,
            targetMonthLabel,
            groupLabel: menuState.groupLabel,
            rows: menuState.rows,
        });
    };

    const handleConfirmCancel = () => {
        if (moving) return;
        setMoveConfirm(null);
    };

    const handleConfirmMove = async () => {
        if (!moveConfirm || moving) return;
        const toMove = confirmMovableRows.filter(
            (r) => (r.reportMonth ?? '').trim() !== moveConfirm.targetMonth,
        );
        if (toMove.length === 0) {
            setMoveConfirm(null);
            return;
        }
        setMoving(true);
        try {
            await onMove(toMove, moveConfirm.targetMonth);
        } finally {
            setMoving(false);
            setMoveConfirm(null);
        }
    };

    const handleConfirmAll = async () => {
        if (!menuState || confirmingAll || rowsNeedingConfirm.length === 0) return;
        setConfirmingAll(true);
        handleCloseAll();
        try {
            await onConfirmAll(menuState.rows);
        } finally {
            setConfirmingAll(false);
        }
    };

    return (
        <>
            <Menu
                open={menuState != null}
                onClose={handleCloseAll}
                anchorReference="anchorPosition"
                anchorPosition={
                    menuState != null
                        ? { top: menuState.mouseY, left: menuState.mouseX }
                        : undefined
                }
                slotProps={{
                    paper: {
                        sx: {
                            ...compactMenuPaperSx,
                            maxWidth: 200,
                        },
                    },
                }}
                MenuListProps={{ dense: true }}
            >
                {isBookingGroup && (
                    <MenuItem
                        disabled={isMoveDisabled || movableRows.length === 0}
                        onMouseEnter={(e) => setSubmenuAnchor(e.currentTarget)}
                        sx={{ ...compactMenuItemSx, pr: 0.25, gap: 0.25 }}
                    >
                        <ListItemText
                            primary={t('accountancy.moveBookingTransactionsMenu')}
                            slotProps={{ primary: compactListItemTextProps.primaryTypographyProps }}
                            sx={{ my: 0 }}
                        />
                        <ChevronRightIcon sx={{ fontSize: '0.875rem', opacity: 0.7, flexShrink: 0 }} />
                    </MenuItem>
                )}
                <MenuItem
                    disabled={
                        isConfirmAllDisabled || confirmingAll || rowsNeedingConfirm.length === 0
                    }
                    onClick={handleConfirmAll}
                    sx={compactMenuItemSx}
                >
                    <ListItemText
                        primary={t('accountancy.confirmAllGroupTransactionsMenu')}
                        slotProps={{ primary: compactListItemTextProps.primaryTypographyProps }}
                        sx={{ my: 0 }}
                    />
                </MenuItem>
            </Menu>

            <Menu
                anchorEl={submenuAnchor}
                open={Boolean(submenuAnchor) && menuState != null && isBookingGroup}
                onClose={() => setSubmenuAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                slotProps={{
                    paper: {
                        sx: {
                            ...compactMenuPaperSx,
                            minWidth: 56,
                        },
                    },
                }}
                MenuListProps={{
                    dense: true,
                    onMouseLeave: () => setSubmenuAnchor(null),
                    sx: { maxHeight: 220, overflow: 'auto', py: 0.25 },
                }}
            >
                {reportMonthOptions.map((o) => (
                    <MenuItem
                        key={o.value}
                        disabled={isTargetMonthDisabled(o.value)}
                        onClick={() => handleSelectTargetMonth(o.value, o.label)}
                        sx={compactMenuItemSx}
                    >
                        {o.label}
                    </MenuItem>
                ))}
            </Menu>

            <Dialog
                open={moveConfirm != null}
                onClose={handleConfirmCancel}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{t('accountancy.moveBookingTransactionsConfirmTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('accountancy.moveBookingTransactionsConfirmMessage')
                            .replace('{{count}}', String(rowsToMoveCount))
                            .replace('{{booking}}', moveConfirm?.groupLabel ?? '')
                            .replace('{{sourcePeriod}}', sourcePeriodLabel)
                            .replace('{{targetMonth}}', moveConfirm?.targetMonthLabel ?? '')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleConfirmCancel} disabled={moving}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleConfirmMove}
                        disabled={moving || rowsToMoveCount === 0}
                    >
                        {moving
                            ? t('accountancy.moveBookingTransactionsInProgress')
                            : t('accountancy.moveBookingTransactionsConfirmAction')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

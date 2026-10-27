'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
    MenuList,
    Paper,
    Popper,
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

export type BookingGroupMoveRoomTarget = {
    objectId: number;
    objectName: string;
    roomName: string;
};

export type BookingGroupObjectRoomOption = {
    objectId: number;
    objectName: string;
    rooms: { roomName: string }[];
};

type MoveConfirmState = {
    targetMonth: string;
    targetMonthLabel: string;
    groupLabel: string;
    rows: AccountancyOverviewOperationRowModel[];
};

type MoveToRoomConfirmState = {
    target: BookingGroupMoveRoomTarget;
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
    objectRoomOptions: BookingGroupObjectRoomOption[];
    isMoveToRoomDisabled: boolean;
    isRoomMoveTargetDisabled: (target: BookingGroupMoveRoomTarget) => boolean;
    onMoveToRoom: (
        rows: AccountancyOverviewOperationRowModel[],
        target: BookingGroupMoveRoomTarget,
    ) => Promise<void>;
    getRowsToMoveToRoom: (
        rows: AccountancyOverviewOperationRowModel[],
        target: BookingGroupMoveRoomTarget,
    ) => AccountancyOverviewOperationRowModel[];
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

const scrollableMenuListSx = {
    maxHeight: 360,
    overflow: 'auto',
    py: 0.25,
};

const scrollableRoomMenuListSx = {
    maxHeight: 280,
    overflow: 'auto',
    py: 0.25,
};

const hoverableMenuItemSx = {
    ...compactMenuItemSx,
    '&.Mui-disabled': {
        pointerEvents: 'auto',
    },
};

const submenuParentItemSx = {
    ...hoverableMenuItemSx,
    pr: 0.25,
    gap: 0.25,
};

type CascadeMenuProps = {
    anchorEl: HTMLElement | null;
    open: boolean;
    children: ReactNode;
    paperSx?: object;
    listSx?: object;
    /** Выше корневого Menu, каждый следующий уровень — ещё выше. */
    zIndexOffset?: number;
};

function CascadeMenu({
    anchorEl,
    open,
    children,
    paperSx,
    listSx,
    zIndexOffset = 1,
}: CascadeMenuProps) {
    return (
        <Popper
            open={open && anchorEl != null}
            anchorEl={anchorEl}
            placement="right-start"
            modifiers={[
                { name: 'offset', options: { offset: [0, -2] } },
                {
                    name: 'flip',
                    options: { fallbackPlacements: ['right-end', 'left-start'] },
                },
                { name: 'preventOverflow', options: { padding: 8, altAxis: true } },
            ]}
            sx={{ zIndex: (theme) => theme.zIndex.modal + zIndexOffset }}
        >
            <Paper elevation={3} sx={paperSx}>
                <MenuList dense autoFocusItem={false} sx={listSx}>
                    {children}
                </MenuList>
            </Paper>
        </Popper>
    );
}

function focusMenuItem(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return;
    target.focus({ preventScroll: true });
}

export function BookingGroupContextMenu({
    menuState,
    onCloseMenu,
    sourcePeriodLabel,
    reportMonthOptions,
    isTargetMonthDisabled,
    isMoveDisabled,
    onMove,
    objectRoomOptions,
    isMoveToRoomDisabled,
    isRoomMoveTargetDisabled,
    onMoveToRoom,
    getRowsToMoveToRoom,
    isConfirmAllDisabled,
    onConfirmAll,
}: BookingGroupContextMenuProps) {
    const { t } = useTranslation();
    const [monthSubmenuAnchor, setMonthSubmenuAnchor] = useState<HTMLElement | null>(null);
    const [roomObjectSubmenuAnchor, setRoomObjectSubmenuAnchor] = useState<HTMLElement | null>(null);
    const [roomListSubmenuAnchor, setRoomListSubmenuAnchor] = useState<HTMLElement | null>(null);
    const [hoveredObjectId, setHoveredObjectId] = useState<number | null>(null);
    const [moveConfirm, setMoveConfirm] = useState<MoveConfirmState | null>(null);
    const [moveToRoomConfirm, setMoveToRoomConfirm] = useState<MoveToRoomConfirmState | null>(null);
    const [moving, setMoving] = useState(false);
    const [movingToRoom, setMovingToRoom] = useState(false);
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

    const confirmRoomMovableRows = useMemo(() => {
        if (!moveToRoomConfirm) return [];
        return getRowsToMoveToRoom(moveToRoomConfirm.rows, moveToRoomConfirm.target);
    }, [moveToRoomConfirm, getRowsToMoveToRoom]);

    const rowsToMoveCount = useMemo(() => {
        if (!moveConfirm) return 0;
        return confirmMovableRows.filter(
            (r) => (r.reportMonth ?? '').trim() !== moveConfirm.targetMonth,
        ).length;
    }, [moveConfirm, confirmMovableRows]);

    const rowsToMoveToRoomCount = useMemo(() => {
        if (!moveToRoomConfirm) return 0;
        return confirmRoomMovableRows.length;
    }, [moveToRoomConfirm, confirmRoomMovableRows]);

    const hoveredObject = useMemo(
        () => objectRoomOptions.find((o) => o.objectId === hoveredObjectId) ?? null,
        [objectRoomOptions, hoveredObjectId],
    );

    const closeSubmenus = useCallback(() => {
        setMonthSubmenuAnchor(null);
        setRoomObjectSubmenuAnchor(null);
        setRoomListSubmenuAnchor(null);
        setHoveredObjectId(null);
    }, []);

    const handleCloseAll = useCallback(() => {
        closeSubmenus();
        onCloseMenu();
    }, [closeSubmenus, onCloseMenu]);

    useEffect(() => {
        closeSubmenus();
    }, [menuState?.mouseX, menuState?.mouseY, menuState?.bookingId, closeSubmenus]);

    useEffect(() => {
        if (menuState == null) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            if (roomListSubmenuAnchor) {
                event.preventDefault();
                event.stopPropagation();
                setRoomListSubmenuAnchor(null);
                setHoveredObjectId(null);
                return;
            }
            if (roomObjectSubmenuAnchor || monthSubmenuAnchor) {
                event.preventDefault();
                event.stopPropagation();
                setMonthSubmenuAnchor(null);
                setRoomObjectSubmenuAnchor(null);
                setRoomListSubmenuAnchor(null);
                setHoveredObjectId(null);
                return;
            }
            handleCloseAll();
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [
        menuState,
        monthSubmenuAnchor,
        roomObjectSubmenuAnchor,
        roomListSubmenuAnchor,
        handleCloseAll,
    ]);

    const handleSelectTargetMonth = (targetMonth: string, targetMonthLabel: string) => {
        if (!menuState) return;
        closeSubmenus();
        onCloseMenu();
        setMoveConfirm({
            targetMonth,
            targetMonthLabel,
            groupLabel: menuState.groupLabel,
            rows: menuState.rows,
        });
    };

    const handleSelectRoomTarget = (target: BookingGroupMoveRoomTarget) => {
        if (!menuState) return;
        closeSubmenus();
        onCloseMenu();
        setMoveToRoomConfirm({
            target,
            groupLabel: menuState.groupLabel,
            rows: menuState.rows,
        });
    };

    const handleConfirmCancel = () => {
        if (moving) return;
        setMoveConfirm(null);
    };

    const handleMoveToRoomConfirmCancel = () => {
        if (movingToRoom) return;
        setMoveToRoomConfirm(null);
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

    const handleConfirmMoveToRoom = async () => {
        if (!moveToRoomConfirm || movingToRoom) return;
        if (confirmRoomMovableRows.length === 0) {
            setMoveToRoomConfirm(null);
            return;
        }
        setMovingToRoom(true);
        try {
            await onMoveToRoom(confirmRoomMovableRows, moveToRoomConfirm.target);
        } finally {
            setMovingToRoom(false);
            setMoveToRoomConfirm(null);
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
                disableEnforceFocus
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
                            maxWidth: 240,
                        },
                    },
                }}
                MenuListProps={{ dense: true }}
            >
                {isBookingGroup && (
                    <MenuItem
                        disabled={isMoveDisabled || movableRows.length === 0}
                        selected={monthSubmenuAnchor != null}
                        onMouseEnter={(e) => {
                            focusMenuItem(e.currentTarget);
                            if (isMoveDisabled || movableRows.length === 0) {
                                closeSubmenus();
                                return;
                            }
                            setMonthSubmenuAnchor(e.currentTarget);
                            setRoomObjectSubmenuAnchor(null);
                            setRoomListSubmenuAnchor(null);
                            setHoveredObjectId(null);
                        }}
                        sx={submenuParentItemSx}
                    >
                        <ListItemText
                            primary={t('accountancy.moveBookingTransactionsMenu')}
                            slotProps={{ primary: compactListItemTextProps.primaryTypographyProps }}
                            sx={{ my: 0 }}
                        />
                        <ChevronRightIcon sx={{ fontSize: '0.875rem', opacity: 0.7, flexShrink: 0 }} />
                    </MenuItem>
                )}
                {isBookingGroup && (
                    <MenuItem
                        disabled={isMoveToRoomDisabled || movableRows.length === 0}
                        selected={roomObjectSubmenuAnchor != null}
                        onMouseEnter={(e) => {
                            focusMenuItem(e.currentTarget);
                            if (isMoveToRoomDisabled || movableRows.length === 0) {
                                closeSubmenus();
                                return;
                            }
                            setRoomObjectSubmenuAnchor(e.currentTarget);
                            setMonthSubmenuAnchor(null);
                            setRoomListSubmenuAnchor(null);
                            setHoveredObjectId(null);
                        }}
                        sx={submenuParentItemSx}
                    >
                        <ListItemText
                            primary={t('accountancy.moveBookingTransactionsToRoomMenu')}
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
                    onMouseEnter={(e) => {
                        focusMenuItem(e.currentTarget);
                        closeSubmenus();
                    }}
                    onClick={handleConfirmAll}
                    sx={hoverableMenuItemSx}
                >
                    <ListItemText
                        primary={t('accountancy.confirmAllGroupTransactionsMenu')}
                        slotProps={{ primary: compactListItemTextProps.primaryTypographyProps }}
                        sx={{ my: 0 }}
                    />
                </MenuItem>
            </Menu>

            <CascadeMenu
                anchorEl={monthSubmenuAnchor}
                open={Boolean(monthSubmenuAnchor) && menuState != null && isBookingGroup}
                paperSx={{ ...compactMenuPaperSx, minWidth: 56 }}
                listSx={{ maxHeight: 220, overflow: 'auto', py: 0.25 }}
            >
                {reportMonthOptions.map((o) => (
                    <MenuItem
                        key={o.value}
                        disabled={isTargetMonthDisabled(o.value)}
                        onMouseEnter={(e) => focusMenuItem(e.currentTarget)}
                        onClick={() => handleSelectTargetMonth(o.value, o.label)}
                        sx={hoverableMenuItemSx}
                    >
                        {o.label}
                    </MenuItem>
                ))}
            </CascadeMenu>

            <CascadeMenu
                anchorEl={roomObjectSubmenuAnchor}
                open={Boolean(roomObjectSubmenuAnchor) && menuState != null && isBookingGroup}
                paperSx={{ ...compactMenuPaperSx, minWidth: 140, maxWidth: 260 }}
                listSx={scrollableMenuListSx}
            >
                {objectRoomOptions.map((objectOption) => (
                    <MenuItem
                        key={objectOption.objectId}
                        selected={hoveredObjectId === objectOption.objectId}
                        onMouseEnter={(e) => {
                            focusMenuItem(e.currentTarget);
                            setRoomListSubmenuAnchor(e.currentTarget);
                            setHoveredObjectId(objectOption.objectId);
                        }}
                        sx={{
                            ...submenuParentItemSx,
                            maxWidth: 248,
                        }}
                    >
                        <ListItemText
                            primary={objectOption.objectName}
                            slotProps={{
                                primary: {
                                    ...compactListItemTextProps.primaryTypographyProps,
                                    noWrap: true,
                                    title: objectOption.objectName,
                                },
                            }}
                            sx={{ my: 0, minWidth: 0 }}
                        />
                        <ChevronRightIcon sx={{ fontSize: '0.875rem', opacity: 0.7, flexShrink: 0 }} />
                    </MenuItem>
                ))}
            </CascadeMenu>

            <CascadeMenu
                anchorEl={roomListSubmenuAnchor}
                open={
                    Boolean(roomListSubmenuAnchor) &&
                    hoveredObject != null &&
                    menuState != null &&
                    isBookingGroup
                }
                zIndexOffset={2}
                paperSx={{ ...compactMenuPaperSx, minWidth: 100, maxWidth: 200 }}
                listSx={scrollableRoomMenuListSx}
            >
                {hoveredObject?.rooms.map((room) => {
                    const target: BookingGroupMoveRoomTarget = {
                        objectId: hoveredObject.objectId,
                        objectName: hoveredObject.objectName,
                        roomName: room.roomName,
                    };
                    return (
                        <MenuItem
                            key={`${hoveredObject.objectId}-${room.roomName}`}
                            disabled={isRoomMoveTargetDisabled(target)}
                            onMouseEnter={(e) => focusMenuItem(e.currentTarget)}
                            onClick={() => handleSelectRoomTarget(target)}
                            sx={{
                                ...hoverableMenuItemSx,
                                maxWidth: 192,
                            }}
                        >
                            <ListItemText
                                primary={room.roomName}
                                slotProps={{
                                    primary: {
                                        ...compactListItemTextProps.primaryTypographyProps,
                                        noWrap: true,
                                        title: room.roomName,
                                    },
                                }}
                                sx={{ my: 0, minWidth: 0 }}
                            />
                        </MenuItem>
                    );
                })}
            </CascadeMenu>

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

            <Dialog
                open={moveToRoomConfirm != null}
                onClose={handleMoveToRoomConfirmCancel}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{t('accountancy.moveBookingTransactionsToRoomConfirmTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('accountancy.moveBookingTransactionsToRoomConfirmMessage')
                            .replace('{{count}}', String(rowsToMoveToRoomCount))
                            .replace('{{booking}}', moveToRoomConfirm?.groupLabel ?? '')
                            .replace('{{objectName}}', moveToRoomConfirm?.target.objectName ?? '')
                            .replace('{{roomName}}', moveToRoomConfirm?.target.roomName ?? '')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleMoveToRoomConfirmCancel} disabled={movingToRoom}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleConfirmMoveToRoom}
                        disabled={movingToRoom || rowsToMoveToRoomCount === 0}
                    >
                        {movingToRoom
                            ? t('accountancy.moveBookingTransactionsInProgress')
                            : t('accountancy.moveBookingTransactionsConfirmAction')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

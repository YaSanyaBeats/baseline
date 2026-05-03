'use client';

import { Fragment, useState } from 'react';
import { IconButton, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import type { Object as Obj } from '@/lib/types';
import type { AccountancyObjectRoomRowHighlight } from '@/lib/accountancyObjectRoomRowHighlight';
import { useTranslation } from '@/i18n/useTranslation';

/** Подсветка «жёлтый» — не `palette.warning` (в MUI это оранжевый) */
const ROOM_YELLOW = '#EAB308';

export type AccountancyObjectTreeTableProps = {
    objects: Obj[];
    selectedObjectId: number | 'all';
    /** Стабильное имя юнита (как в сводке) или все комнаты */
    selectedRoomId: string | 'all';
    onSelectObject: (objectId: number) => void;
    onSelectRoom: (objectId: number, roomName: string) => void;
    /** Подсветка подпункта «комната»; без пропа — только стандартные стили */
    getRoomRowHighlight?: (objectId: number, roomName: string) => AccountancyObjectRoomRowHighlight;
};

function stableTreeRoomLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

function roomRowBackground(
    theme: Theme,
    highlight: AccountancyObjectRoomRowHighlight,
    selected: boolean,
): string | undefined {
    if (highlight === 'default') {
        return undefined;
    }
    const strong = selected;
    switch (highlight) {
        case 'red':
            return alpha(theme.palette.error.main, strong ? 0.3 : 0.18);
        case 'yellow':
            return alpha(ROOM_YELLOW, strong ? 0.34 : 0.22);
        case 'blue':
            return alpha(theme.palette.info.main, strong ? 0.32 : 0.2);
        default:
            return undefined;
    }
}

export function AccountancyObjectTreeTable({
    objects,
    selectedObjectId,
    selectedRoomId,
    onSelectObject,
    onSelectRoom,
    getRoomRowHighlight,
}: AccountancyObjectTreeTableProps) {
    const theme = useTheme();
    const { t } = useTranslation();
    /** Только для первого объекта: комнаты по умолчанию свёрнуты */
    const [firstObjectRoomsExpanded, setFirstObjectRoomsExpanded] = useState(false);

    return (
        <Table size="small" sx={{ fontSize: '0.75rem', '& .MuiTableCell-root': { py: 0.5, px: 1 } }}>
            <TableBody>
                {objects.map((obj, objIndex) => {
                    const roomTypes = obj.roomTypes ?? [];
                    const isFirstObject = objIndex === 0;
                    const showRooms = !isFirstObject || firstObjectRoomsExpanded;
                    const isObjectRowSelected =
                        selectedObjectId !== 'all' && selectedObjectId === obj.id && selectedRoomId === 'all';
                    return (
                        <Fragment key={`object-${objIndex}-${obj.propertyName || 'obj'}-${obj.id}`}>
                            <TableRow
                                hover
                                selected={isObjectRowSelected}
                                onClick={() => onSelectObject(obj.id)}
                                sx={{
                                    cursor: 'pointer',
                                    bgcolor: (t) =>
                                        t.palette.mode === 'light'
                                            ? t.palette.grey[100]
                                            : alpha(t.palette.common.white, 0.06),
                                    '&:hover': {
                                        bgcolor: (t) =>
                                            t.palette.mode === 'light'
                                                ? t.palette.grey[200]
                                                : alpha(t.palette.common.white, 0.1),
                                    },
                                    '&.Mui-selected': {
                                        bgcolor: 'action.selected',
                                        '&:hover': { bgcolor: 'action.selected' },
                                    },
                                }}
                            >
                                <TableCell sx={{ py: 0.5, px: 1 }}>
                                    <Typography
                                        component="span"
                                        variant="body2"
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 0,
                                            fontSize: '0.75rem',
                                            overflow: 'hidden',
                                            fontWeight: 600,
                                            '& > span': {
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                minWidth: 0,
                                                flex: 1,
                                            },
                                        }}
                                    >
                                        {isFirstObject ? (
                                            <IconButton
                                                size="small"
                                                aria-expanded={firstObjectRoomsExpanded}
                                                aria-label={
                                                    firstObjectRoomsExpanded
                                                        ? t('accountancy.firstObjectRoomsCollapse')
                                                        : t('accountancy.firstObjectRoomsExpand')
                                                }
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setFirstObjectRoomsExpanded((v) => !v);
                                                }}
                                                sx={{
                                                    p: 0.25,
                                                    mr: 0.25,
                                                    color: 'text.secondary',
                                                    '& svg': {
                                                        transition: (t) =>
                                                            t.transitions.create('transform', {
                                                                duration: t.transitions.duration.shorter,
                                                            }),
                                                        transform: firstObjectRoomsExpanded
                                                            ? 'rotate(180deg)'
                                                            : 'rotate(0deg)',
                                                    },
                                                }}
                                            >
                                                <ExpandMoreIcon fontSize="small" />
                                            </IconButton>
                                        ) : null}
                                        <span>{obj.name}</span>
                                    </Typography>
                                </TableCell>
                            </TableRow>
                            {showRooms &&
                                roomTypes.map((room, roomIndex) => {
                                    const roomLabelKey = stableTreeRoomLabel(room);
                                    const isRoomRowSelected =
                                        selectedObjectId === obj.id && selectedRoomId === roomLabelKey;
                                    const roomLabel = room.name || `Room ${room.id}`;
                                    const hl = getRoomRowHighlight?.(obj.id, roomLabelKey) ?? 'default';
                                    const rowBg = roomRowBackground(theme, hl, isRoomRowSelected);
                                    return (
                                        <TableRow
                                            key={`room-${objIndex}-${roomIndex}-${obj.id}-${room.id}`}
                                            hover
                                            selected={isRoomRowSelected}
                                            onClick={() => onSelectRoom(obj.id, roomLabelKey)}
                                            sx={{
                                                cursor: 'pointer',
                                                ...(!rowBg
                                                    ? { '&.Mui-selected': { bgcolor: 'action.selected' } }
                                                    : {
                                                          bgcolor: rowBg,
                                                          '&.Mui-selected': { bgcolor: rowBg },
                                                      }),
                                                '&:hover': {
                                                    bgcolor: (t) => {
                                                        if (hl === 'default') {
                                                            return t.palette.action.hover;
                                                        }
                                                        const c =
                                                            hl === 'red'
                                                                ? t.palette.error.main
                                                                : hl === 'yellow'
                                                                  ? ROOM_YELLOW
                                                                  : t.palette.info.main;
                                                        return alpha(c, 0.35);
                                                    },
                                                },
                                            }}
                                        >
                                            <TableCell
                                                sx={{
                                                    py: 0.35,
                                                    pl: 4,
                                                    pr: 1,
                                                }}
                                            >
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        pl: 0.75,
                                                        fontSize: '0.7rem',
                                                        lineHeight: 1.25,
                                                        color: 'text.secondary',
                                                    }}
                                                >
                                                    {roomLabel}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                        </Fragment>
                    );
                })}
            </TableBody>
        </Table>
    );
}

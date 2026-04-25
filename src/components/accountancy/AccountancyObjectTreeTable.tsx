'use client';

import { Fragment } from 'react';
import { Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import type { Object as Obj } from '@/lib/types';
import type { AccountancyObjectRoomRowHighlight } from '@/lib/accountancyObjectRoomRowHighlight';

export type AccountancyObjectTreeTableProps = {
    objects: Obj[];
    selectedObjectId: number | 'all';
    selectedRoomId: number | 'all';
    onSelectObject: (objectId: number) => void;
    onSelectRoom: (objectId: number, roomId: number) => void;
    /** Подсветка подпункта «комната»; без пропа — только стандартные стили */
    getRoomRowHighlight?: (objectId: number, roomId: number) => AccountancyObjectRoomRowHighlight;
};

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
            return alpha(theme.palette.warning.main, strong ? 0.34 : 0.22);
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

    return (
        <Table size="small" sx={{ fontSize: '0.75rem', '& .MuiTableCell-root': { py: 0.5, px: 1 } }}>
            <TableBody>
                {objects.map((obj) => {
                    const roomTypes = obj.roomTypes ?? [];
                    const isObjectRowSelected =
                        selectedObjectId !== 'all' && selectedObjectId === obj.id && selectedRoomId === 'all';
                    return (
                        <Fragment key={`${obj.propertyName || 'obj'}-${obj.id}`}>
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
                                            fontSize: '0.75rem',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            fontWeight: 600,
                                        }}
                                    >
                                        {obj.name}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                            {roomTypes.map((room) => {
                                const isRoomRowSelected =
                                    selectedObjectId === obj.id && selectedRoomId === room.id;
                                const roomLabel = room.name || `Room ${room.id}`;
                                const hl = getRoomRowHighlight?.(obj.id, room.id) ?? 'default';
                                const rowBg = roomRowBackground(theme, hl, isRoomRowSelected);
                                return (
                                    <TableRow
                                        key={`room-${obj.id}-${room.id}`}
                                        hover
                                        selected={isRoomRowSelected}
                                        onClick={() => onSelectRoom(obj.id, room.id)}
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
                                                              ? t.palette.warning.main
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

'use client';

import { Fragment, useMemo, useState } from 'react';
import { IconButton, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import type { Object as Obj } from '@/lib/types';
import type { AccountancyObjectRoomRowHighlight } from '@/lib/accountancyObjectRoomRowHighlight';
import {
    groupAccountancyObjectsByName,
    isAccountancyObjectGroupSelected,
    stableAccountancyRoomLabel,
} from '@/lib/accountancyObjectGroups';
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
    const groups = useMemo(() => groupAccountancyObjectsByName(objects), [objects]);
    /** Только для первой группы: комнаты по умолчанию свёрнуты */
    const [firstGroupRoomsExpanded, setFirstGroupRoomsExpanded] = useState(false);

    return (
        <Table size="small" sx={{ fontSize: '0.75rem', '& .MuiTableCell-root': { py: 0.5, px: 1 } }}>
            <TableBody>
                {groups.map((group, groupIndex) => {
                    const isFirstGroup = groupIndex === 0;
                    const showRooms = !isFirstGroup || firstGroupRoomsExpanded;
                    const isObjectRowSelected =
                        isAccountancyObjectGroupSelected(selectedObjectId, group) &&
                        selectedRoomId === 'all';
                    const roomEntries = group.members.flatMap((member) =>
                        (member.roomTypes ?? []).map((room) => ({
                            member,
                            room,
                            roomLabelKey: stableAccountancyRoomLabel(room),
                        })),
                    );
                    return (
                        <Fragment key={`group-${group.displayName}`}>
                            <TableRow
                                hover
                                selected={isObjectRowSelected}
                                onClick={() => onSelectObject(group.primaryObjectId)}
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
                                        {isFirstGroup ? (
                                            <IconButton
                                                size="small"
                                                aria-expanded={firstGroupRoomsExpanded}
                                                aria-label={
                                                    firstGroupRoomsExpanded
                                                        ? t('accountancy.firstObjectRoomsCollapse')
                                                        : t('accountancy.firstObjectRoomsExpand')
                                                }
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setFirstGroupRoomsExpanded((v) => !v);
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
                                                        transform: firstGroupRoomsExpanded
                                                            ? 'rotate(180deg)'
                                                            : 'rotate(0deg)',
                                                    },
                                                }}
                                            >
                                                <ExpandMoreIcon fontSize="small" />
                                            </IconButton>
                                        ) : null}
                                        <span>{group.displayName}</span>
                                    </Typography>
                                </TableCell>
                            </TableRow>
                            {showRooms &&
                                roomEntries.map(({ member, room, roomLabelKey }, roomIndex) => {
                                    const isRoomRowSelected =
                                        selectedObjectId === member.id &&
                                        selectedRoomId === roomLabelKey;
                                    const roomLabel = room.name || `Room ${room.id}`;
                                    const hl =
                                        getRoomRowHighlight?.(member.id, roomLabelKey) ?? 'default';
                                    const rowBg = roomRowBackground(theme, hl, isRoomRowSelected);
                                    return (
                                        <TableRow
                                            key={`room-${group.displayName}-${member.id}-${room.id}-${roomIndex}`}
                                            hover
                                            selected={isRoomRowSelected}
                                            onClick={() => onSelectRoom(member.id, roomLabelKey)}
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

'use client';

import { Fragment, memo, useMemo, useState } from 'react';
import { IconButton, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';
import type { Object as Obj } from '@/lib/types';
import type { AccountancyObjectRoomRowHighlight } from '@/lib/accountancyObjectRoomRowHighlight';
import { accountancyRoomHighlightKey } from '@/lib/accountancyObjectRoomRowHighlight';
import {
    groupAccountancyObjectsByName,
    isAccountancyObjectGroupSelected,
    stableAccountancyRoomLabel,
} from '@/lib/accountancyObjectGroups';
import { useTranslation } from '@/i18n/useTranslation';

const ROOM_ROW_RED = '#FFCDD2';
const ROOM_ROW_WHITE = '#FFFFFF';

export type AccountancyObjectTreeTableProps = {
    objects: Obj[];
    selectedObjectId: number | 'all';
    /** Стабильное имя юнита (как в сводке) или все комнаты */
    selectedRoomId: string | 'all';
    onSelectObject: (objectId: number) => void;
    onSelectRoom: (objectId: number, roomName: string) => void;
    /** Предрасчитанная подсветка: ключ `${objectId}\u0001${roomKey}` */
    roomHighlightByKey?: ReadonlyMap<string, AccountancyObjectRoomRowHighlight>;
};

function roomRowBackground(
    highlight: AccountancyObjectRoomRowHighlight,
    mode: 'light' | 'dark',
): string {
    if (highlight === 'red') {
        return mode === 'light' ? ROOM_ROW_RED : alpha('#FFCDD2', 0.35);
    }
    return mode === 'light' ? ROOM_ROW_WHITE : alpha(ROOM_ROW_WHITE, 0.04);
}

function AccountancyObjectTreeTableInner({
    objects,
    selectedObjectId,
    selectedRoomId,
    onSelectObject,
    onSelectRoom,
    roomHighlightByKey,
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
                                        roomHighlightByKey?.get(
                                            accountancyRoomHighlightKey(member.id, roomLabelKey),
                                        ) ?? 'white';
                                    const rowBg = roomRowBackground(hl, theme.palette.mode);
                                    return (
                                        <TableRow
                                            key={`room-${group.displayName}-${member.id}-${room.id}-${roomIndex}`}
                                            hover
                                            selected={isRoomRowSelected}
                                            onClick={() => onSelectRoom(member.id, roomLabelKey)}
                                            sx={{
                                                cursor: 'pointer',
                                                bgcolor: rowBg,
                                                '&.Mui-selected': {
                                                    bgcolor: isRoomRowSelected ? 'action.selected' : rowBg,
                                                },
                                                '&:hover': {
                                                    bgcolor: isRoomRowSelected
                                                        ? 'action.selected'
                                                        : rowBg,
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

export const AccountancyObjectTreeTable = memo(AccountancyObjectTreeTableInner);

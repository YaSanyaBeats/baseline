/** Значение: "room:objectId:encodedRoomName", "room:from_booking" (только правила автоучёта), "cp:…", "user:…" или "cf:…" */
import {
    PREFIX_ROOM,
    decodeRoomNameSegment,
    formatRoomSourceRecipient,
} from '@/lib/roomBinding';

export type SourceRecipientOptionValue = string;

export { PREFIX_ROOM, formatRoomSourceRecipient };
export const PREFIX_CP = 'cp:';
export const PREFIX_USER = 'user:';
export const PREFIX_CF = 'cf:';

/** В правиле автоучёта: при создании записи подставить объект+комнату из обрабатываемой брони */
export const ROOM_FROM_BOOKING_VALUE = 'room:from_booking' as const;

export type ParsedSourceRecipient =
    | { type: 'room'; objectId: number; roomName: string }
    | { type: 'room_from_booking' }
    | { type: 'counterparty'; id: string }
    | { type: 'user'; id: string }
    | { type: 'cashflow'; id: string };

export function parseSourceRecipientValue(
    value: SourceRecipientOptionValue | undefined,
): ParsedSourceRecipient | null {
    if (!value) return null;
    if (value === ROOM_FROM_BOOKING_VALUE) return { type: 'room_from_booking' };
    if (value.startsWith(PREFIX_ROOM)) {
        const m = /^room:(-?\d+):(.*)$/.exec(value);
        if (!m) return null;
        const objectId = parseInt(m[1], 10);
        const tail = m[2];
        if (Number.isNaN(objectId) || tail === '') return null;
        const roomName = decodeRoomNameSegment(tail);
        return { type: 'room', objectId, roomName };
    }
    if (value.startsWith(PREFIX_CP)) {
        const id = value.slice(PREFIX_CP.length);
        if (id) return { type: 'counterparty', id };
    }
    if (value.startsWith(PREFIX_USER)) {
        const id = value.slice(PREFIX_USER.length);
        if (id) return { type: 'user', id };
    }
    if (value.startsWith(PREFIX_CF)) {
        const id = value.slice(PREFIX_CF.length);
        if (id) return { type: 'cashflow', id };
    }
    return null;
}

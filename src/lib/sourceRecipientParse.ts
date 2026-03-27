/** Значение: "room:objectId:roomId", "room:from_booking" (только правила автоучёта), "cp:…", "user:…" или "cf:…" */
export type SourceRecipientOptionValue = string;

export const PREFIX_ROOM = 'room:';
export const PREFIX_CP = 'cp:';
export const PREFIX_USER = 'user:';
export const PREFIX_CF = 'cf:';

/** В правиле автоучёта: при создании записи подставить объект+комнату из обрабатываемой брони */
export const ROOM_FROM_BOOKING_VALUE = 'room:from_booking' as const;

export type ParsedSourceRecipient =
    | { type: 'room'; objectId: number; roomId: number }
    | { type: 'room_from_booking' }
    | { type: 'counterparty'; id: string }
    | { type: 'user'; id: string }
    | { type: 'cashflow'; id: string };

export function parseSourceRecipientValue(
    value: SourceRecipientOptionValue | undefined
): ParsedSourceRecipient | null {
    if (!value) return null;
    if (value === ROOM_FROM_BOOKING_VALUE) return { type: 'room_from_booking' };
    if (value.startsWith(PREFIX_ROOM)) {
        const parts = value.slice(PREFIX_ROOM.length).split(':');
        const objectId = parseInt(parts[0], 10);
        const roomId = parseInt(parts[1], 10);
        if (!isNaN(objectId) && !isNaN(roomId)) return { type: 'room', objectId, roomId };
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

import {
    resolveUnitNameForAccountingObject,
    type RawBedsObjectForRoom,
} from '@/lib/roomBinding';
import { shouldExpandToRoomTypesPerRawObject } from '@/lib/server/getObjects';

export type BookingSyncDoc = {
    id?: number;
    arrival?: string;
    departure?: string;
    propertyId?: number;
    unitId?: number;
    roomId?: number;
    roomID?: number;
};

export type BookingRoomContext = {
    objectId: number;
    roomKey: string;
};

export function getBookingUnitId(booking: BookingSyncDoc): number | null {
    const uid = booking.unitId ?? booking.roomId ?? booking.roomID;
    if (uid == null) return null;
    const n = Number(uid);
    return Number.isFinite(n) ? n : null;
}

export function resolveBookingRoomContexts(
    rawObjects: readonly RawBedsObjectForRoom[],
    propertyId: number | undefined,
    unitId: number | null | undefined,
): BookingRoomContext[] {
    if (propertyId == null || !Number.isFinite(propertyId) || unitId == null) return [];

    const contexts: BookingRoomContext[] = [];
    const seen = new Set<string>();

    for (const doc of rawObjects) {
        if (doc?.id !== propertyId) continue;
        const expanded = shouldExpandToRoomTypesPerRawObject(doc);

        for (const rt of doc.roomTypes || []) {
            for (const unit of rt?.units || []) {
                if (unit?.id !== unitId) continue;
                const roomKey =
                    unit?.name != null && String(unit.name).trim() !== ''
                        ? String(unit.name).trim()
                        : `Unit ${unitId}`;
                const objectId = expanded && typeof rt?.id === 'number' ? rt.id : propertyId;
                const key = `${objectId}:${roomKey}`;
                if (seen.has(key)) continue;
                seen.add(key);
                contexts.push({ objectId, roomKey });
            }
        }
    }

    if (contexts.length === 0) {
        const roomKey = resolveUnitNameForAccountingObject(rawObjects, propertyId, unitId);
        if (roomKey) {
            contexts.push({ objectId: propertyId, roomKey });
        }
    }

    return contexts;
}

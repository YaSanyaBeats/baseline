import type { Booking, Object, UserObject } from '@/lib/types';

function roomLabel(r: { id: number; name?: string }): string {
    return r.name != null && String(r.name).trim() !== ''
        ? String(r.name).trim()
        : `Unit ${r.id ?? ''}`;
}

export function ownerRoomNameSet(rooms: { id: number; name?: string }[]): Set<string> {
    return new Set(rooms.map(roomLabel));
}

export function bookingMatchesOwnerRooms(
    booking: Booking,
    bookingPropertyId: number,
    roomsForObject: { id: number; name?: string }[],
    roomFilter: string | 'all' = 'all'
): boolean {
    if (booking.propertyId !== bookingPropertyId) return false;
    if (roomsForObject.length === 0) return false;
    if (roomFilter !== 'all') {
        const row = roomsForObject.find((r) => roomLabel(r) === roomFilter);
        return row != null && booking.unitId === row.id;
    }
    if (booking.unitId == null) return false;
    return roomsForObject.some((r) => r.id === booking.unitId);
}

export function transactionMatchesOwnerRooms(
    roomName: string | null | undefined,
    roomsForObject: { id: number; name?: string }[],
    roomFilter: string | 'all' = 'all'
): boolean {
    if (roomsForObject.length === 0) return false;
    if (roomFilter !== 'all') {
        return roomName != null && roomName !== '' && roomName === roomFilter;
    }
    if (roomName == null || String(roomName).trim() === '') return false;
    return ownerRoomNameSet(roomsForObject).has(String(roomName).trim());
}

export function isOwnerAccessibleRoomName(
    roomName: string,
    roomsForObject: { id: number; name?: string }[]
): boolean {
    if (roomsForObject.length === 0) return false;
    if (roomName === '—') return false;
    return ownerRoomNameSet(roomsForObject).has(roomName);
}

/** Объекты и комнаты, доступные владельцу (по user.objects). */
export function filterObjectsForOwner(objects: Object[], ownerAssignments: UserObject[]): Object[] {
    if (!Array.isArray(ownerAssignments) || ownerAssignments.length === 0) return [];
    return objects
        .map((row) => {
            const oi =
                ownerAssignments.find((o) => o.id === row.id) ??
                ownerAssignments.find((o) => o.id === row.propertyId);
            if (!oi) {
                return { ...row, roomTypes: [] };
            }
            if (!Array.isArray(oi.rooms) || oi.rooms.length === 0) {
                return row;
            }
            const nameSet = new Set(oi.rooms.map((s) => String(s)));
            return {
                ...row,
                roomTypes: row.roomTypes.filter((r) => nameSet.has(roomLabel(r))),
            };
        })
        .filter((row) => row.roomTypes.length > 0);
}

function ownerAssignmentRoomNames(uo: UserObject): Set<string> {
    const names = new Set<string>();
    for (const r of uo.rooms ?? []) {
        if (typeof r === 'string') {
            const trimmed = r.trim();
            if (trimmed) names.add(trimmed);
        } else if (typeof r === 'number') {
            names.add(String(r));
        }
    }
    return names;
}

/**
 * Проводка относится к владельцу по user.objects: совпадение roomType/property id и имени комнаты.
 * Учитывает objectId как id строки объекта (roomType) или propertyId.
 */
export function transactionMatchesOwnerAssignment(
    record: { objectId: number; roomName?: string | null },
    ownerAssignments: UserObject[],
    ownerObjects: { id: number; propertyId?: number }[],
): boolean {
    if (!Array.isArray(ownerAssignments) || ownerAssignments.length === 0) return false;

    const roomName = (record.roomName ?? '').trim();
    if (!roomName) return false;

    for (const uo of ownerAssignments) {
        const assignedRooms = ownerAssignmentRoomNames(uo);

        if (assignedRooms.size > 0 && !assignedRooms.has(roomName)) continue;

        if (uo.id === record.objectId) return true;

        for (const obj of ownerObjects) {
            const linkedToAssignment = obj.id === uo.id || obj.propertyId === uo.id;
            if (!linkedToAssignment) continue;
            if (record.objectId !== obj.id && record.objectId !== obj.propertyId) continue;
            return true;
        }
    }

    return false;
}

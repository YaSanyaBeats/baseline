/** Стабильная привязка к комнате по имени юнита (а не по unit id из Beds24). */

export const PREFIX_ROOM = 'room:';

export type RawBedsObjectForRoom = {
    id?: number;
    roomTypes?: {
        id?: number;
        units?: { id?: number; name?: string }[];
    }[];
};

export function encodeRoomNameSegment(name: string): string {
    return encodeURIComponent(name);
}

export function decodeRoomNameSegment(segment: string): string {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

export function roomMetadataMapKey(objectId: number, roomName: string): string {
    return `${objectId}_${encodeRoomNameSegment(roomName)}`;
}

export function formatRoomSourceRecipient(objectId: number, roomName: string): string {
    return `${PREFIX_ROOM}${objectId}:${encodeRoomNameSegment(roomName)}`;
}

/** Найти имя юнита по accounting object id (property или roomType) и бывшему unit id. */
export function resolveUnitNameForAccountingObject(
    rawObjects: readonly RawBedsObjectForRoom[],
    accountingObjectId: number,
    unitId: number,
): string | null {
    for (const doc of rawObjects) {
        const pid = doc?.id;
        if (typeof pid !== 'number') continue;
        for (const rt of doc.roomTypes || []) {
            if (accountingObjectId !== pid && accountingObjectId !== rt?.id) continue;
            for (const u of rt?.units || []) {
                if (u?.id === unitId) {
                    const nm = u?.name != null ? String(u.name).trim() : '';
                    return nm || String(unitId);
                }
            }
        }
    }
    /**
     * Внутренние объекты (отрицательный id документа): филиалы с id -2, -3… под компанией -1.
     * Записи могут иметь objectId = id филиала; тогда основной проход не находит документ.
     */
    if (accountingObjectId < 0 && typeof unitId === 'number' && !Number.isNaN(unitId) && unitId < 0) {
        for (const doc of rawObjects) {
            const pid = doc?.id;
            if (typeof pid !== 'number' || pid >= 0) continue;
            for (const rt of doc.roomTypes || []) {
                for (const u of rt?.units || []) {
                    if (u?.id === unitId) {
                        const nm = u?.name != null ? String(u.name).trim() : '';
                        return nm || String(unitId);
                    }
                }
            }
        }
    }
    return null;
}

/** Имя юнита в контексте доступа пользователя: userObject.id — property или roomType. */
export function resolveUserRoomName(
    rawObjects: readonly RawBedsObjectForRoom[],
    userObjectId: number,
    unitId: number,
): string | null {
    return resolveUnitNameForAccountingObject(rawObjects, userObjectId, unitId);
}

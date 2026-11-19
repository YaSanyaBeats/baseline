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

/**
 * Канонический propertyId (objects.id / Beds24) для метаданных.
 * Если передан roomType.id — возвращает id родительского property.
 */
export function resolvePropertyIdForMetadata(
    rawObjects: readonly RawBedsObjectForRoom[],
    accountingObjectId: number,
): number {
    for (const doc of rawObjects) {
        const pid = doc?.id;
        if (typeof pid !== 'number') continue;
        if (accountingObjectId === pid) return pid;
        for (const rt of doc.roomTypes || []) {
            if (rt?.id === accountingObjectId) return pid;
        }
    }
    return accountingObjectId;
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

export type BookingAccountingPlacementInput = {
    propertyId?: number;
    unitId?: number;
    /** Beds24 room type. В бронях это roomId. */
    roomId?: number;
    roomID?: number;
};

export type BookingAccountingPlacement = {
    /** roomType.id, если объект развёрнут по типам; иначе property или первый room type. */
    accountingObjectId: number;
    unitName: string | undefined;
};

function asFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

function unitLabel(unit: { id?: number; name?: string }, fallbackId: number): string {
    const nm = unit.name != null ? String(unit.name).trim() : '';
    return nm || String(unit.id ?? fallbackId);
}

function unitNameInRoomType(
    roomType: { units?: { id?: number; name?: string }[] },
    unitId: number | undefined,
): string | undefined {
    const units = roomType.units ?? [];
    if (unitId != null) {
        const unit = units.find((item) => item?.id === unitId);
        if (unit) return unitLabel(unit, unitId);
    }
    if (units.length === 1 && units[0]) {
        return unitLabel(units[0], units[0].id ?? unitId ?? 0);
    }
    return undefined;
}

/** Beds24-объект, у которого каждая строка учёта — отдельный room type. */
function roomTypesAreAccountingObjects(doc: RawBedsObjectForRoom): boolean {
    const pid = doc.id;
    if (typeof pid !== 'number' || pid <= 0) return false;
    const roomTypes = doc.roomTypes ?? [];
    if (roomTypes.length === 0) return false;
    return roomTypes.every((rt) => rt != null && typeof rt.id === 'number');
}

/**
 * Объект учёта и имя юнита для брони.
 * unitId в Beds24 уникален только внутри room type (часто у всех типов это 1).
 * Для мультиобъекта берётся roomId брони, и имя ищется только среди юнитов этого типа.
 */
export function resolveBookingAccountingPlacement(
    rawObjects: readonly RawBedsObjectForRoom[],
    booking: BookingAccountingPlacementInput,
): BookingAccountingPlacement {
    const propertyId = asFiniteNumber(booking.propertyId) ?? 0;
    const unitId = asFiniteNumber(booking.unitId);
    const listedRoomId = asFiniteNumber(booking.roomId) ?? asFiniteNumber(booking.roomID);
    const doc = rawObjects.find((item) => item?.id === propertyId);

    if (doc && roomTypesAreAccountingObjects(doc)) {
        const roomTypes = doc.roomTypes ?? [];
        const matched =
            listedRoomId != null ? roomTypes.find((rt) => rt?.id === listedRoomId) : undefined;
        const roomType = matched ?? roomTypes[0];
        const accountingObjectId =
            roomType && typeof roomType.id === 'number' ? roomType.id : propertyId;
        return {
            accountingObjectId,
            unitName: roomType ? unitNameInRoomType(roomType, unitId) : undefined,
        };
    }

    const firstRoomTypeId = doc?.roomTypes?.[0]?.id;
    const accountingObjectId =
        propertyId > 0 && typeof firstRoomTypeId === 'number' ? firstRoomTypeId : propertyId;
    const unitName =
        unitId == null
            ? undefined
            : resolveUnitNameForAccountingObject(rawObjects, accountingObjectId, unitId) ??
              resolveUnitNameForAccountingObject(rawObjects, propertyId, unitId) ??
              undefined;
    return { accountingObjectId, unitName };
}

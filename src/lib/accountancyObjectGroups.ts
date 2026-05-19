import type { Booking, Object as Obj, Room } from '@/lib/types';

function normalizeUnitOrRoomId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

export function normalizeAccountancyObjectName(name: string): string {
    return String(name ?? '').trim();
}

export function stableAccountancyRoomLabel(room: { id: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id}`;
}

export type AccountancyObjectGroup = {
    displayName: string;
    /** Минимальный id среди строк группы — для выбора «весь объект» */
    primaryObjectId: number;
    members: Obj[];
};

/** Группы объектов сводки по отображаемому имени (несколько roomType → одна строка в UI). */
export function groupAccountancyObjectsByName(objects: Obj[]): AccountancyObjectGroup[] {
    const byName = new Map<string, Obj[]>();
    const firstIndex = new Map<string, number>();

    objects.forEach((obj, index) => {
        const key = normalizeAccountancyObjectName(obj.name);
        if (!byName.has(key)) {
            byName.set(key, []);
            firstIndex.set(key, index);
        }
        byName.get(key)!.push(obj);
    });

    const groups: AccountancyObjectGroup[] = [];
    for (const [displayName, members] of byName) {
        const sorted = [...members].sort((a, b) => a.id - b.id);
        groups.push({
            displayName,
            primaryObjectId: sorted[0].id,
            members: sorted,
        });
    }

    groups.sort(
        (a, b) => (firstIndex.get(a.displayName) ?? 0) - (firstIndex.get(b.displayName) ?? 0),
    );
    return groups;
}

/** Все строки объекта с тем же отображаемым именем, что и у выбранного id. */
export function getAccountancyObjectGroupMembers(objects: Obj[], objectId: number): Obj[] {
    const row = objects.find((o) => o.id === objectId);
    if (!row) return [];
    const key = normalizeAccountancyObjectName(row.name);
    return objects.filter((o) => normalizeAccountancyObjectName(o.name) === key);
}

export function isAccountancyObjectGroupSelected(
    selectedObjectId: number | 'all',
    group: AccountancyObjectGroup,
): boolean {
    if (selectedObjectId === 'all') return false;
    return group.members.some((m) => m.id === selectedObjectId);
}

/** Комнаты всех строк группы (без дублирования по id комнаты в рамках одной строки объекта). */
export function mergeRoomsForAccountancyObjectGroup(members: Obj[]): Room[] {
    const merged: Room[] = [];
    const seen = new Set<string>();

    for (const obj of members) {
        for (const room of obj.roomTypes ?? []) {
            const key = `${obj.id}:${room.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(room);
        }
    }
    return merged;
}

function recordObjectMatchesSingle(
    recordObjectId: number,
    selected: { id: number; propertyId: number },
    allObjects: { id: number; propertyId: number }[],
): boolean {
    const rid = normalizeUnitOrRoomId(recordObjectId);
    if (rid != null && rid === selected.id) return true;
    const row = allObjects.find(
        (o) => o.id === recordObjectId || normalizeUnitOrRoomId(o.id) === rid,
    );
    return row != null && row.propertyId === selected.propertyId;
}

/**
 * Проводка относится к выбранному объекту сводки: тот же id/propertyId
 * или любая строка с тем же отображаемым именем (несколько roomType Beds24).
 */
export function recordObjectMatchesAccountancySelection(
    recordObjectId: number,
    selected: { id: number; propertyId: number; name: string },
    allObjects: { id: number; propertyId: number; name: string }[],
): boolean {
    const members = getAccountancyObjectGroupMembers(allObjects as Obj[], selected.id);
    if (members.length <= 1) {
        return recordObjectMatchesSingle(recordObjectId, selected, allObjects);
    }
    return members.some((member) =>
        recordObjectMatchesSingle(recordObjectId, member, allObjects),
    );
}

export function bookingBelongsToAccountancyObjectGroup(
    booking: Booking,
    groupMembers: { id: number; propertyId: number }[],
): boolean {
    const bp = booking.propertyId;
    if (bp === undefined || bp === null) return true;
    return groupMembers.some((m) => bp === m.propertyId || bp === m.id);
}

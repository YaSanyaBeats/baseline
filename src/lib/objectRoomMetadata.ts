/**
 * API-клиент для работы с метаданными объектов и комнат.
 * Данные хранятся в отдельной коллекции objectRoomMetadata, т.к. коллекция objects
 * при синхронизации полностью стирается.
 */

import type { ObjectType, RoomLevel } from './types';
import type { CommissionSchemeId } from './commissionCalculation';

export interface ObjectMetadata {
    objectId: number;
    district?: string;
    objectType?: ObjectType;
}

export interface RoomMetadata {
    objectId: number;
    roomId: number;
    bedrooms?: number;
    bathrooms?: number;
    livingRoomSofas?: number;
    kitchen?: 'yes' | 'no';
    level?: RoomLevel;
    commissionSchemeId?: CommissionSchemeId;
}

export interface ObjectRoomMetadataResponse {
    objects: Record<number, ObjectMetadata>;
    rooms: Record<string, RoomMetadata>; // key: `${objectId}_${roomId}`
}

export async function getObjectRoomMetadata(): Promise<ObjectRoomMetadataResponse> {
    const res = await fetch('/api/objectRoomMetadata');
    if (!res.ok) {
        throw new Error('Failed to fetch object/room metadata');
    }
    return res.json();
}

export async function updateObjectMetadata(objectId: number, data: Partial<ObjectMetadata>): Promise<void> {
    const res = await fetch(`/api/objectRoomMetadata/object/${objectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update object metadata');
    }
}

export async function updateRoomMetadata(
    objectId: number,
    roomId: number,
    data: Partial<RoomMetadata>
): Promise<void> {
    const res = await fetch(`/api/objectRoomMetadata/room/${objectId}/${roomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update room metadata');
    }
}

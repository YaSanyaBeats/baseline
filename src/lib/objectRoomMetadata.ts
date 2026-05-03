/**
 * API-клиент для работы с метаданными объектов и комнат.
 * Данные хранятся в отдельной коллекции objectRoomMetadata, т.к. коллекция objects
 * при синхронизации полностью стирается.
 */

import type { ObjectType, RoomLevel } from './types';
import type { CommissionSchemeId } from './commissionCalculation';
import { encodeRoomNameSegment } from './roomBinding';

export interface ObjectMetadata {
    objectId: number;
    district?: string;
    objectType?: ObjectType;
}

export interface RoomMetadata {
    objectId: number;
    roomName: string;
    bedrooms?: number;
    bathrooms?: number;
    livingRoomSofas?: number;
    kitchen?: 'yes' | 'no';
    level?: RoomLevel;
    commissionSchemeId?: CommissionSchemeId;
    internetProviderCounterpartyId?: string;
    internetCostPerMonth?: number;
}

export interface ObjectRoomMetadataResponse {
    objects: Record<number, ObjectMetadata>;
    rooms: Record<string, RoomMetadata>; // key: roomMetadataMapKey(objectId, roomName)
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

/** null в internetProviderCounterpartyId сбрасывает поле на сервере */
export type RoomMetadataPatch = Omit<Partial<RoomMetadata>, 'internetProviderCounterpartyId'> & {
    internetProviderCounterpartyId?: string | null;
};

export async function updateRoomMetadata(
    objectId: number,
    roomName: string,
    data: RoomMetadataPatch
): Promise<void> {
    const enc = encodeRoomNameSegment(roomName);
    const res = await fetch(`/api/objectRoomMetadata/room/${objectId}/${enc}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update room metadata');
    }
}

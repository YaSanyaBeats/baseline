import axios from 'axios';
import { Booking, Object, Room } from './types';
import { getApiUrl } from './api-client';

export async function getBookingsPerRoom(roomInfo: { object: Object; room: Room }) {
    const propertyId = roomInfo.object.propertyId ?? roomInfo.object.id;
    const response = await axios.get(getApiUrl('bookings'), {
        params: {
            'roomInfo[object][propertyId]': propertyId,
            'roomInfo[room][id]': roomInfo.room.id,
        },
    });
    return response.data;
}

export interface BookingSearchParams {
    objectId?: number;
    /** Несколько propertyId — один GET с `objectIds=1,2,3` (см. API). */
    objectIds?: number[];
    /** ID комнаты из справочника (room type); на бэкенде сверяется с unitId / roomId брони */
    roomId?: number;
    /** Поисковая строка; в URL уходит как `text` (см. API). */
    query?: string;
    text?: string;
    from?: string;
    to?: string;
    /**
     * Вместе с overlapTo: брони, у которых интервал [arrival, departure] пересекается с
     * [overlapFrom, overlapTo] (инкл.). На бэкенде имеет приоритет над from/to.
     */
    overlapFrom?: string;
    overlapTo?: string;
}

export async function searchBookings(params: BookingSearchParams): Promise<Booking[]> {
    const { objectId, objectIds, roomId, query, text, from, to, overlapFrom, overlapTo } = params;
    const searchStr = (text ?? query)?.trim();
    const axiosParams: Record<string, string | number> = {};
    if (objectIds != null && objectIds.length > 0) {
        axiosParams.objectIds = objectIds.join(',');
    } else if (objectId != null) {
        axiosParams.objectId = objectId;
    }
    if (roomId != null) axiosParams.roomId = roomId;
    if (searchStr) axiosParams.text = searchStr;
    if (from) axiosParams.from = from;
    if (to) axiosParams.to = to;
    if (overlapFrom) axiosParams.overlapFrom = overlapFrom;
    if (overlapTo) axiosParams.overlapTo = overlapTo;
    const response = await axios.get(getApiUrl('bookings/search'), {
        params: axiosParams,
    });
    return response.data;
}

export async function getBookingsByIds(ids: number[]): Promise<Booking[]> {
    if (!ids.length) return [];
    const response = await axios.post(getApiUrl('bookings/byIds'), { ids });
    return response.data;
}


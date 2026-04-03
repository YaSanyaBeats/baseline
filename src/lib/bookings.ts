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
    /** Поисковая строка; в URL уходит как `text` (см. API). */
    query?: string;
    text?: string;
    from?: string;
    to?: string;
}

export async function searchBookings(params: BookingSearchParams): Promise<Booking[]> {
    const { objectId, query, text, from, to } = params;
    const searchStr = (text ?? query)?.trim();
    const axiosParams: Record<string, string | number> = {};
    if (objectId != null) axiosParams.objectId = objectId;
    if (searchStr) axiosParams.text = searchStr;
    if (from) axiosParams.from = from;
    if (to) axiosParams.to = to;
    const response = await axios.get(getApiUrl('bookings/search'), {
        params: axiosParams,
    });
    return response.data;
}

export async function getBookingsByIds(ids: number[]): Promise<Booking[]> {
    if (!ids.length) return [];
    const response = await axios.get(getApiUrl('bookings/byIds'), {
        params: {
            ids: ids.join(','),
        },
    });
    return response.data;
}


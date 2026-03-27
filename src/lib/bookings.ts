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
    query?: string;
    from?: string;
    to?: string;
}

export async function searchBookings(params: BookingSearchParams): Promise<Booking[]> {
    const response = await axios.get(getApiUrl('bookings/search'), {
        params,
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


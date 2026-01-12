import axios from 'axios';
import { Object, Room } from './types';
import { getApiUrl } from './api-client';

export async function getBookingsPerRoom(roomInfo: {object: Object, room: Room}){
    const response = await axios.get(getApiUrl('bookings'), {
        params: {
            roomInfo: roomInfo
        }
    });
    return response.data;
}
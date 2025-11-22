import axios from 'axios';
import { Object, Room } from './types';

export async function getBookingsPerRoom(roomInfo: {object: Object, room: Room}){
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return [];
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'bookings', {
        params: {
            roomInfo: roomInfo
        }
    });
    return response.data;
}
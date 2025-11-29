import axios from 'axios';
import { UserObject } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getObjects(session: any){
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return [];
    }
    
    if(session?.user?.role == 'owner') {
        const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'objects', {
            params: {
                userID: session.user._id
            }
        });
        return response.data;
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'objects');
    return response.data;
}

export async function getAllObjects() {
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return [];
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'objects', {
        params: {
            all: true
        }
    });
    return response.data;
}

export async function getObject(IDs: number[]){
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return;
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'objects', {
        params: {
            id: IDs
        }
    });
    return response.data;
}

export async function getRooms(roomInfo: UserObject[]){
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return;
    }

    console.log(roomInfo);

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'objects', {
        params: {
            roomInfo: roomInfo
        }
    });
    return response.data;
}

export async function syncObjects() {
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return;
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'sync', {
        params: {
            type: 'objects'
        }
    });
    return response.data;
}

export async function syncPrices() {
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return;
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'sync', {
        params: {
            type: 'prices'
        }
    });
    return response.data;
}

export async function syncBookings() {
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return;
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'sync', {
        params: {
            type: 'bookings'
        }
    });
    return response.data;
}
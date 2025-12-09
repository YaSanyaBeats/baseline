import axios, { AxiosError } from 'axios';
import { UserObject } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getObjects(session: any){
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return [];
    }
    
    try {
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
    catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            console.error('Axios error:', {
                message: axiosError.message,
                status: axiosError.response?.status,
                data: axiosError.response?.data,
            });
        } else {
            console.error('Unexpected error:', error);
        }

        // Возвращаем пустой массив при любой ошибке
        return [];
    }
    
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
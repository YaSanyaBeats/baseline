import axios, { AxiosError } from 'axios';
import { UserObject } from '../types';
import { getApiUrl } from '../api-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getObjects(session: any){
    try {
        if(session?.user?.role == 'owner') {
            const response = await axios.get(getApiUrl('objects'), {
                params: {
                    userID: session.user._id
                }
            });
            return response.data;
        }

        const response = await axios.get(getApiUrl('objects'));
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
    const response = await axios.get(getApiUrl('objects'), {
        params: {
            all: true
        }
    });
    return response.data;
}

export async function getObject(IDs: number[]){
    const response = await axios.get(getApiUrl('objects'), {
        params: {
            id: IDs
        }
    });
    return response.data;
}

export async function getRooms(roomInfo: UserObject[]){
    console.log(roomInfo);

    const response = await axios.get(getApiUrl('objects'), {
        params: {
            roomInfo: roomInfo
        }
    });
    return response.data;
}

export async function syncObjects() {
    const response = await axios.get(getApiUrl('sync'), {
        params: {
            type: 'objects'
        }
    });
    return response.data;
}

export async function syncPrices() {
    const response = await axios.get(getApiUrl('sync'), {
        params: {
            type: 'prices'
        }
    });
    return response.data;
}

export async function syncBookings() {
    const response = await axios.get(getApiUrl('sync'), {
        params: {
            type: 'bookings'
        }
    });
    return response.data;
}
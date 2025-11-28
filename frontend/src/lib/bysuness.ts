import axios from 'axios';
import { Object } from './types';

export async function getBusynessPerDays(object: Object){
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return [];
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'bysuness', {
        params: {
            objectID: object.id
        }
    });
    return response.data;
}
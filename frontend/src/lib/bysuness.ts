import axios from 'axios';
import { Object } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBusynessPerDays(object: Object, session: any){
    if(!process.env.NEXT_PUBLIC_API_URL) {
        return [];
    }

    if(!session) {
        return;
    }

    if(session?.user?.role == 'owner') {
        const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'bysuness', {
            params: {
                userID: session.user._id,
                objectID: object.id
            }
        });
        return response.data;
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'bysuness', {
        params: {
            objectID: object.id
        }
    });
    return response.data;
    
}
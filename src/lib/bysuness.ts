import axios from 'axios';
import { Object } from './types';
import { getApiUrl } from './api-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBusynessPerDays(object: Object, session: any){
    if(!session) {
        return;
    }

    if(session?.user?.role == 'owner') {
        const response = await axios.get(getApiUrl('bysuness'), {
            params: {
                userID: session.user._id,
                objectID: object.id
            }
        });
        return response.data;
    }

    const response = await axios.get(getApiUrl('bysuness'), {
        params: {
            objectID: object.id
        }
    });
    return response.data;
    
}
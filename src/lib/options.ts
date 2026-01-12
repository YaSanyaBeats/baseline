import axios from 'axios';
import { Object, OptionsFormData } from '@/lib/types';
import { getApiUrl } from './api-client';

export async function getOptions(): Promise<OptionsFormData>{
    const response = await axios.get(getApiUrl('options'));
    return response.data;
}

export async function sendOptions(formData: OptionsFormData): Promise<void>{
    const response = await axios.post(getApiUrl('options'), {
        params: {
            excludeObjects: formData.excludeObjects.map((object: Object) => {return object.id}),
            excludeSubstr: formData.excludeSubstr,
        }
    });
    return response.data;
}
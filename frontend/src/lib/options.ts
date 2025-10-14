import axios from 'axios';
import { Object, OptionsFormData } from '@/lib/types';

export async function getOptions(): Promise<OptionsFormData>{
    if(!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error('Нет NEXT_PUBLIC_API_URL в переменных окружения');
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'options');
    return response.data;
}

export async function sendOptions(formData: OptionsFormData): Promise<void>{
    if(!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error('Нет NEXT_PUBLIC_API_URL в переменных окружения');
    }

    const response = await axios.post(process.env.NEXT_PUBLIC_API_URL + 'options', {
        params: {
            excludeObjects: formData.excludeObjects.map((object: Object) => {return object.id}),
            excludeSubstr: formData.excludeSubstr,
        }
    });
    return response.data;
}
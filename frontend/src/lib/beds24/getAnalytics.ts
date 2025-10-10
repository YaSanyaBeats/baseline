import axios from 'axios';
import { AnalyticsFilterData, AnalyticsResult } from '../types';
import { Object, Room } from '@/lib/types';

export async function getAnalytics(filterData: AnalyticsFilterData): Promise<AnalyticsResult[][]>{
    if(!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error('Нет NEXT_PUBLIC_API_URL в переменных окружения');
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'analytics', {
        params: {
            objects: filterData.objects.map((object: Object) => {return object.id}),
            startMedian: filterData.startMedian,
            endMedian: filterData.endMedian
        }
    });
    return response.data;
}
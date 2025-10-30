import axios from 'axios';
import { AnalyticsFilterData, FullAnalyticsResult } from '../types';
import { Object } from '@/lib/types';

export async function getAnalytics(filterData: AnalyticsFilterData): Promise<FullAnalyticsResult[]>{
    if(!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error('Нет NEXT_PUBLIC_API_URL в переменных окружения');
    }

    filterData.objects = filterData.objects.filter((elem: Object) => {
        return elem.id !== 1;
    })

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'analytics', {
        params: {
            objects: filterData.objects.map((object: Object) => {return object.id}),
            startMedian: filterData.startMedian,
            endMedian: filterData.endMedian,
            startDate: filterData.startDate,
            endDate: filterData.endDate,
            periodMode: filterData.periodMode,
            step: filterData.step,
        }
    });
    return response.data;
}
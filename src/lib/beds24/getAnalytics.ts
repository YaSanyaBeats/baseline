import axios from 'axios';
import { AnalyticsFilterData, AnalyticsResponse } from '../types';
import { Object } from '@/lib/types';
import { getApiUrl } from '../api-client';

export async function getAnalytics(filterData: AnalyticsFilterData): Promise<AnalyticsResponse>{
    filterData.objects = filterData.objects.filter((elem: Object) => {
        return elem.id !== 1;
    })

    const response = await axios.get(getApiUrl('analytics'), {
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
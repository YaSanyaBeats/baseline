import axios from 'axios';
import { AnalyticsFilterData, AnalyticsResponse } from '../types';
import { Object } from '@/lib/types';
import { getApiUrl } from '../api-client';

export async function getAnalytics(filterData: AnalyticsFilterData): Promise<AnalyticsResponse>{
    filterData.objects = filterData.objects.filter((elem: Object) => {
        return elem.id !== 1;
    })

    // Список id строк выбора (roomType или id property для развёртки на сервере) — API: roomTypeIds[].
    const params = new URLSearchParams();
    for (const object of filterData.objects) {
        params.append('roomTypeIds[]', String(object.id));
    }
    params.set('startMedian', filterData.startMedian);
    params.set('endMedian', filterData.endMedian);
    params.set('startDate', filterData.startDate);
    params.set('endDate', filterData.endDate);
    params.set('periodMode', filterData.periodMode);
    params.set('step', filterData.step);

    const response = await axios.get(getApiUrl('analytics'), { params });
    return response.data;
}
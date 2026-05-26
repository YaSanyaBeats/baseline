import { apiClient, getApiUrl } from '@/lib/api-client';
import type { CommonResponse } from '@/lib/types';

export async function getClosedReportMonths(): Promise<string[]> {
    const response = await apiClient.get(getApiUrl('accountancy/closed-months'));
    return Array.isArray(response.data?.months) ? (response.data.months as string[]) : [];
}

export async function closeReportMonth(reportMonth: string): Promise<CommonResponse> {
    const response = await apiClient.post(getApiUrl('accountancy/closed-months'), { reportMonth });
    return response.data;
}

export async function reopenReportMonth(reportMonth: string): Promise<CommonResponse> {
    const response = await apiClient.delete(getApiUrl('accountancy/closed-months'), {
        params: { reportMonth },
    });
    return response.data;
}

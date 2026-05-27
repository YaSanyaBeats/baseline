import { apiClient, getApiUrl } from '@/lib/api-client';
import type { ClosedPeriodsData, ClosedRoomPeriod, RoomPeriodInput } from '@/lib/accountancyClosedMonth';
import type { CommonResponse } from '@/lib/types';

export type ClosedPeriodsResponse = CommonResponse & {
    months?: string[];
    globalMonths?: string[];
    roomPeriods?: ClosedRoomPeriod[];
};

export async function getClosedPeriods(): Promise<ClosedPeriodsData> {
    const response = await apiClient.get<ClosedPeriodsResponse>(getApiUrl('accountancy/closed-months'));
    const data = response.data;
    return {
        globalMonths: Array.isArray(data?.globalMonths) ? data.globalMonths : [],
        roomPeriods: Array.isArray(data?.roomPeriods) ? data.roomPeriods : [],
    };
}

/** @deprecated Используйте getClosedPeriods */
export async function getClosedReportMonths(): Promise<string[]> {
    const response = await apiClient.get(getApiUrl('accountancy/closed-months'));
    return Array.isArray(response.data?.months) ? (response.data.months as string[]) : [];
}

export async function closeReportRoomPeriods(
    reportMonth: string,
    rooms: RoomPeriodInput[],
): Promise<CommonResponse> {
    const response = await apiClient.post(getApiUrl('accountancy/closed-months'), { reportMonth, rooms });
    return response.data;
}

export async function reopenReportRoomPeriods(
    reportMonth: string,
    rooms: RoomPeriodInput[],
): Promise<CommonResponse> {
    const response = await apiClient.delete(getApiUrl('accountancy/closed-months'), {
        data: { reportMonth, rooms },
    });
    return response.data;
}

/** @deprecated Используйте closeReportRoomPeriods */
export async function closeReportMonth(reportMonth: string): Promise<CommonResponse> {
    const response = await apiClient.post(getApiUrl('accountancy/closed-months'), { reportMonth });
    return response.data;
}

/** @deprecated Используйте reopenReportRoomPeriods */
export async function reopenReportMonth(reportMonth: string): Promise<CommonResponse> {
    const response = await apiClient.delete(getApiUrl('accountancy/closed-months'), {
        params: { reportMonth },
    });
    return response.data;
}

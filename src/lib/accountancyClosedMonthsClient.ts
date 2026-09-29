import { apiClient, getApiUrl } from '@/lib/api-client';
import type { ClosedPeriodsData, ClosedRoomPeriod, RoomPeriodInput } from '@/lib/accountancyClosedMonth';
import type { SavedOwnerReportStatus } from '@/lib/ownerReportSnapshots';
import type { CommonResponse } from '@/lib/types';

export type ClosedPeriodsResponse = CommonResponse & {
    months?: string[];
    globalMonths?: string[];
    roomPeriods?: ClosedRoomPeriod[];
    savedReports?: SavedOwnerReportStatus[];
};

export type LockPeriodPageData = ClosedPeriodsData & {
    savedReports: SavedOwnerReportStatus[];
};

export async function getClosedPeriods(): Promise<ClosedPeriodsData> {
    const data = await getLockPeriodPageData();
    return {
        globalMonths: data.globalMonths,
        roomPeriods: data.roomPeriods,
    };
}

export async function getLockPeriodPageData(): Promise<LockPeriodPageData> {
    const response = await apiClient.get<ClosedPeriodsResponse>(getApiUrl('accountancy/closed-months'));
    const data = response.data;
    return {
        globalMonths: Array.isArray(data?.globalMonths) ? data.globalMonths : [],
        roomPeriods: Array.isArray(data?.roomPeriods) ? data.roomPeriods : [],
        savedReports: Array.isArray(data?.savedReports) ? data.savedReports : [],
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

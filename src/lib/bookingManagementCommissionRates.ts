import axios from 'axios';
import type { BookingManagementCommissionRate, CommonResponse } from './types';
import { apiClient, getApiUrl } from './api-client';

export async function getBookingManagementCommissionRates(
    bookingIds: number[],
): Promise<BookingManagementCommissionRate[]> {
    const ids = Array.from(new Set(bookingIds.filter((id) => Number.isInteger(id) && id > 0)));
    if (ids.length === 0) return [];

    const response = await apiClient.get(getApiUrl('bookingManagementCommissionRates'), {
        params: { bookingIds: ids.join(',') },
    });
    return response.data;
}

export async function saveBookingManagementCommissionRate(
    bookingId: number,
    percent: BookingManagementCommissionRate['percent'],
    reportMonth?: string,
): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('bookingManagementCommissionRates'), {
        bookingId,
        percent,
        ...(reportMonth ? { reportMonth } : {}),
    });
    return response.data;
}

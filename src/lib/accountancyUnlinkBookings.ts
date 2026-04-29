import axios from 'axios';
import { getApiUrl } from './api-client';
import { AccountancyCategoryType } from './types';

export type UnlinkBookingsByCategoryResponse = {
    success: boolean;
    message?: string;
    modifiedCount?: number;
    matchedCount?: number;
};

export async function unlinkBookingsByCategory(
    recordType: AccountancyCategoryType,
    category: string,
): Promise<UnlinkBookingsByCategoryResponse> {
    const response = await axios.post(getApiUrl('accountancy/unlink-bookings-by-category'), {
        recordType,
        category,
    });
    return response.data;
}

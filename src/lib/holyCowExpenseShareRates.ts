import axios from 'axios';
import type { CommonResponse, HolyCowExpenseShareRate } from './types';
import { apiClient, getApiUrl } from './api-client';

export type HolyCowExpenseShareRateKey = Pick<HolyCowExpenseShareRate, 'objectId' | 'roomName' | 'reportMonth'>;

export function buildHolyCowExpenseShareRateKey(key: HolyCowExpenseShareRateKey): string {
    return `${key.objectId}::${key.roomName}::${key.reportMonth}`;
}

export async function getHolyCowExpenseShareRate(
    key: HolyCowExpenseShareRateKey,
): Promise<HolyCowExpenseShareRate | null> {
    const response = await apiClient.get(getApiUrl('holyCowExpenseShareRates'), {
        params: key,
    });
    return response.data ?? null;
}

export async function saveHolyCowExpenseShareRate(
    key: HolyCowExpenseShareRateKey,
    percent: HolyCowExpenseShareRate['percent'],
): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('holyCowExpenseShareRates'), {
        ...key,
        percent,
    });
    return response.data;
}

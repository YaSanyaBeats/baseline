import axios from 'axios';
import { CommonResponse, CashflowRule } from './types';
import { getApiUrl } from './api-client';

const ENDPOINT = 'cashflowRules';

export async function getCashflowRules(): Promise<CashflowRule[]> {
    const response = await axios.get(getApiUrl(ENDPOINT));
    return response.data;
}

export async function addCashflowRule(
    rule: Omit<CashflowRule, '_id' | 'createdAt'>
): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl(ENDPOINT), rule);
    return response.data;
}

export async function updateCashflowRule(rule: CashflowRule): Promise<CommonResponse> {
    const response = await axios.put(getApiUrl(ENDPOINT), rule);
    return response.data;
}

export async function deleteCashflowRule(id: string): Promise<CommonResponse> {
    const response = await axios.delete(getApiUrl(ENDPOINT), {
        params: { id },
    });
    return response.data;
}

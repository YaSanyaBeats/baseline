import axios from 'axios';
import { CommonResponse, Cashflow } from './types';
import { getApiUrl } from './api-client';

export async function getCashflows(): Promise<Cashflow[]> {
    const response = await axios.get(getApiUrl('cashflows'));
    return response.data;
}

export async function addCashflow(cashflow: Omit<Cashflow, '_id' | 'createdAt'>): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('cashflows'), cashflow);
    return response.data;
}

export async function updateCashflow(cashflow: Cashflow): Promise<CommonResponse> {
    const response = await axios.put(getApiUrl('cashflows'), cashflow);
    return response.data;
}

export async function deleteCashflow(id: string): Promise<CommonResponse> {
    const response = await axios.delete(getApiUrl('cashflows'), {
        params: { id },
    });
    return response.data;
}

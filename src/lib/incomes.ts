import axios from 'axios';
import { CommonResponse, Income } from './types';
import { getApiUrl } from './api-client';

export async function getIncomes(): Promise<Income[]> {
    const response = await axios.get(getApiUrl('incomes'));
    return response.data;
}

export async function addIncome(income: Income): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('incomes'), {
        params: {
            income,
        },
    });
    return response.data;
}

export async function updateIncome(income: Income): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('incomes/editIncome'), {
        params: {
            income,
        },
    });
    return response.data;
}

export async function deleteIncome(id: string): Promise<CommonResponse> {
    const response = await axios.delete(getApiUrl('incomes/deleteIncome'), {
        params: {
            id,
        },
    });
    return response.data;
}


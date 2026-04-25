import axios from 'axios';
import { CommonResponse, Income } from './types';
import { apiClient, getApiUrl } from './api-client';

/** Фильтры для GET /api/incomes (сводка бухгалтерии и др.). Без аргумента — полный список по правам. */
export type IncomesListQuery = {
    objectIds: number[];
    dateFrom?: string;
    dateTo?: string;
};

export async function getIncomes(query?: IncomesListQuery): Promise<Income[]> {
    const params: Record<string, string> = {};
    if (query?.objectIds?.length) {
        params.objectIds = query.objectIds.join(',');
    }
    if (query?.dateFrom) params.dateFrom = query.dateFrom;
    if (query?.dateTo) params.dateTo = query.dateTo;
    const response = await apiClient.get(getApiUrl('incomes'), {
        params: Object.keys(params).length ? params : undefined,
    });
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


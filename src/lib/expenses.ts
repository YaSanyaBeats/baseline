import axios from 'axios';
import { CommonResponse, Expense } from './types';
import { apiClient, getApiUrl } from './api-client';

/** Фильтры для GET /api/expenses (сводка бухгалтерии и др.). Без аргумента — полный список по правам. */
export type ExpensesListQuery = {
    objectIds: number[];
    dateFrom?: string;
    dateTo?: string;
};

export async function getExpenses(query?: ExpensesListQuery): Promise<Expense[]> {
    const params: Record<string, string> = {};
    if (query?.objectIds?.length) {
        params.objectIds = query.objectIds.join(',');
    }
    if (query?.dateFrom) params.dateFrom = query.dateFrom;
    if (query?.dateTo) params.dateTo = query.dateTo;
    const response = await apiClient.get(getApiUrl('expenses'), {
        params: Object.keys(params).length ? params : undefined,
    });
    return response.data;
}

export async function addExpense(expense: Expense): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('expenses'), {
        params: {
            expense,
        },
    });
    return response.data;
}

export async function updateExpense(expense: Expense): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('expenses/editExpense'), {
        params: {
            expense,
        },
    });
    return response.data;
}

export async function deleteExpense(id: string): Promise<CommonResponse> {
    const response = await axios.delete(getApiUrl('expenses/deleteExpense'), {
        params: {
            id,
        },
    });
    return response.data;
}


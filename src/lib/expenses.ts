import axios from 'axios';
import { CommonResponse, Expense } from './types';
import { apiClient, getApiUrl } from './api-client';

/** Фильтры для GET /api/expenses (сводка бухгалтерии и др.). Без аргумента — полный список по правам. */
export type ExpensesListQuery = {
    objectIds?: number[];
    dateFrom?: string;
    dateTo?: string;
    /** Фильтр по кэшфлоу (на сервере проверяется доступ). */
    cashflowId?: string;
};

export async function getExpenses(query?: ExpensesListQuery): Promise<Expense[]> {
    const params: Record<string, string> = {};
    if (query?.objectIds?.length) {
        params.objectIds = query.objectIds.join(',');
    }
    if (query?.dateFrom) params.dateFrom = query.dateFrom;
    if (query?.dateTo) params.dateTo = query.dateTo;
    if (query?.cashflowId) params.cashflowId = query.cashflowId;
    const response = await apiClient.get(getApiUrl('expenses'), {
        params: Object.keys(params).length ? params : undefined,
    });
    return response.data;
}

/** Одна запись по id (те же проверки доступа, что и у списка). */
export async function getExpenseById(id: string): Promise<Expense | null> {
    try {
        const response = await apiClient.get(getApiUrl('expenses'), {
            params: { id },
        });
        return response.data as Expense;
    } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404 || status === 400 || status === 403) return null;
        throw e;
    }
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


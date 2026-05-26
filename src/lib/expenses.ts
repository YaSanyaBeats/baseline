import axios from 'axios';
import { CommonResponse, Expense } from './types';
import { apiClient, getApiUrl } from './api-client';
import { extractCommonResponseFromAxiosError } from './axiosResponseMessage';

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

export type AddTransactionOptions = {
    allowDuplicate?: boolean;
};

export async function addExpense(expense: Expense, options?: AddTransactionOptions): Promise<CommonResponse> {
    try {
        const response = await axios.post(getApiUrl('expenses'), {
            params: {
                expense,
                allowDuplicate: options?.allowDuplicate,
            },
        });
        return response.data;
    } catch (error) {
        const parsed = extractCommonResponseFromAxiosError(error);
        if (parsed?.code === 'FORBID_DUPLICATES' || parsed?.code === 'REPORT_MONTH_CLOSED') return parsed;
        throw error;
    }
}

export async function updateExpense(expense: Expense): Promise<CommonResponse> {
    try {
        const response = await axios.post(getApiUrl('expenses/editExpense'), {
            params: {
                expense,
            },
        });
        return response.data;
    } catch (error) {
        const parsed = extractCommonResponseFromAxiosError(error);
        if (parsed?.code === 'REPORT_MONTH_CLOSED') return parsed;
        throw error;
    }
}

export async function deleteExpense(id: string): Promise<CommonResponse> {
    try {
        const response = await axios.delete(getApiUrl('expenses/deleteExpense'), {
            params: {
                id,
            },
        });
        return response.data;
    } catch (error) {
        const parsed = extractCommonResponseFromAxiosError(error);
        if (parsed?.code === 'REPORT_MONTH_CLOSED') return parsed;
        throw error;
    }
}


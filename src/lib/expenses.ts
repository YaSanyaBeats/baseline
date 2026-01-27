import axios from 'axios';
import { CommonResponse, Expense } from './types';
import { getApiUrl } from './api-client';

export async function getExpenses(): Promise<Expense[]> {
    const response = await axios.get(getApiUrl('expenses'));
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


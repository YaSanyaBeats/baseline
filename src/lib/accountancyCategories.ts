import axios from 'axios';
import { AccountancyCategory, AccountancyCategoryType, CommonResponse } from './types';
import { getApiUrl } from './api-client';

export async function getAccountancyCategories(type?: AccountancyCategoryType): Promise<AccountancyCategory[]> {
    const response = await axios.get(getApiUrl('accountancyCategories'), {
        params: type ? { type } : undefined,
    });
    return response.data;
}

export async function getAccountancyCategoryById(id: string): Promise<AccountancyCategory | null> {
    const categories = await getAccountancyCategories();
    return categories.find((c) => c._id === id) ?? null;
}

export async function addAccountancyCategory(
    name: string,
    type: AccountancyCategoryType,
    parentId?: string | null,
): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('accountancyCategories'), {
        name,
        type,
        parentId: parentId ?? null,
    });
    return response.data;
}

export async function updateAccountancyCategory(
    id: string,
    data: Partial<Omit<AccountancyCategory, '_id' | 'createdAt'>>,
): Promise<CommonResponse> {
    const response = await axios.put(getApiUrl('accountancyCategories'), {
        _id: id,
        ...data,
    });
    return response.data;
}

export async function reorderAccountancyCategories(
    items: Array<{ id: string; parentId: string | null; order: number }>,
): Promise<CommonResponse> {
    const response = await axios.put(getApiUrl('accountancyCategories'), {
        reorder: items,
    });
    return response.data;
}

export async function deleteAccountancyCategory(id: string): Promise<CommonResponse> {
    const response = await axios.delete(getApiUrl('accountancyCategories'), {
        params: { id },
    });
    return response.data;
}


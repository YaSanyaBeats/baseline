import axios from 'axios';
import { AccountancyCategory, AccountancyCategoryType, CommonResponse } from './types';
import { getApiUrl } from './api-client';

export async function getAccountancyCategories(type?: AccountancyCategoryType): Promise<AccountancyCategory[]> {
    const response = await axios.get(getApiUrl('accountancyCategories'), {
        params: type ? { type } : undefined,
    });
    return response.data;
}

export async function addAccountancyCategory(
    name: string,
    type: AccountancyCategoryType,
): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('accountancyCategories'), {
        name,
        type,
    });
    return response.data;
}

export async function updateAccountancyCategory(
    id: string,
    name: string,
): Promise<CommonResponse> {
    const response = await axios.put(getApiUrl('accountancyCategories'), {
        _id: id,
        name,
    });
    return response.data;
}

export async function deleteAccountancyCategory(id: string): Promise<CommonResponse> {
    const response = await axios.delete(getApiUrl('accountancyCategories'), {
        params: { id },
    });
    return response.data;
}


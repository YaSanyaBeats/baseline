import axios from 'axios';
import { CommonResponse, Counterparty } from './types';
import { getApiUrl } from './api-client';

export async function getCounterparties(): Promise<Counterparty[]> {
    const response = await axios.get(getApiUrl('counterparties'));
    return response.data;
}

export async function addCounterparty(counterparty: Omit<Counterparty, '_id' | 'createdAt'>): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('counterparties'), counterparty);
    return response.data;
}

export async function updateCounterparty(counterparty: Counterparty): Promise<CommonResponse> {
    const response = await axios.put(getApiUrl('counterparties'), counterparty);
    return response.data;
}

export async function deleteCounterparty(id: string): Promise<CommonResponse> {
    const response = await axios.delete(getApiUrl('counterparties'), {
        params: { id },
    });
    return response.data;
}

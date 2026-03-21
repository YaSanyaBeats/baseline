import axios from 'axios';
import { TransactionListRow } from './types';
import { getApiUrl } from './api-client';

export async function getTransactions(): Promise<TransactionListRow[]> {
    const response = await axios.get<{ items: TransactionListRow[] }>(getApiUrl('transactions'));
    return response.data.items ?? [];
}

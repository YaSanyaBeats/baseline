/**
 * Клиентские вызовы API автоучёта (правила и запуск).
 * Серверная логика создания записей — в api/autoAccounting/run.
 */

import axios from 'axios';
import { getApiUrl } from './api-client';
import type { AutoAccountingRule } from './types';

export interface AutoAccountingRulesResponse {
    success?: boolean;
    message?: string;
    rules?: AutoAccountingRule[];
}

export async function getAutoAccountingRules(): Promise<AutoAccountingRule[]> {
    const response = await axios.get(getApiUrl('autoAccounting/rules'));
    if (Array.isArray(response.data)) return response.data;
    if (response.data?.rules) return response.data.rules;
    return [];
}

export async function createAutoAccountingRule(rule: Omit<AutoAccountingRule, '_id' | 'createdAt'>): Promise<{ success: boolean; message: string }> {
    const response = await axios.post(getApiUrl('autoAccounting/rules'), rule);
    return { success: response.data?.success ?? true, message: response.data?.message ?? '' };
}

export async function updateAutoAccountingRule(id: string, rule: Partial<AutoAccountingRule>): Promise<{ success: boolean; message: string }> {
    const response = await axios.put(getApiUrl(`autoAccounting/rules/${id}`), rule);
    return { success: response.data?.success ?? true, message: response.data?.message ?? '' };
}

export async function deleteAutoAccountingRule(id: string): Promise<{ success: boolean; message: string }> {
    const response = await axios.delete(getApiUrl(`autoAccounting/rules/${id}`));
    return { success: response.data?.success ?? true, message: response.data?.message ?? '' };
}

export async function runAutoAccountingForBookings(bookingIds: number[]): Promise<{ success: boolean; message: string; created?: { expenses: number; incomes: number } }> {
    const response = await axios.post(getApiUrl('autoAccounting/run'), { bookingIds });
    return {
        success: response.data?.success ?? false,
        message: response.data?.message ?? '',
        created: response.data?.created,
    };
}

export async function runAutoAccountingForUnprocessed(): Promise<{ success: boolean; message: string; created?: { expenses: number; incomes: number } }> {
    const response = await axios.post(getApiUrl('autoAccounting/run'), { runForUnprocessed: true });
    return {
        success: response.data?.success ?? false,
        message: response.data?.message ?? '',
        created: response.data?.created,
    };
}

export async function getAutoAccountingStatus(): Promise<{ success: boolean; unprocessedBookingCount?: number }> {
    const response = await axios.get(getApiUrl('autoAccounting/status'));
    return {
        success: response.data?.success ?? false,
        unprocessedBookingCount: response.data?.unprocessedBookingCount ?? 0,
    };
}

/** Возвращает ID бронирований из переданного списка, для которых уже запускался автоучёт */
export async function getProcessedBookingIds(bookingIds: number[]): Promise<number[]> {
    if (bookingIds.length === 0) return [];
    const response = await axios.get(getApiUrl('autoAccounting/status'), {
        params: { ids: bookingIds.join(',') },
    });
    if (!response.data?.success || !Array.isArray(response.data.processedBookingIds)) return [];
    return response.data.processedBookingIds;
}

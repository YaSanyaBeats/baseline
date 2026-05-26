import axios from 'axios';
import type { CommonResponse } from './types';

/** Текст ошибки из тела ответа API (axios бросает исключение при 4xx/5xx). */
export function getApiErrorMessage(error: unknown, fallback: string): string {
    const parsed = extractCommonResponseFromAxiosError(error);
    if (parsed?.message?.trim()) return parsed.message;
    return fallback;
}

/** Тело ответа API из axios-ошибки (4xx/5xx), если сервер вернул JSON. */
export function extractCommonResponseFromAxiosError(error: unknown): CommonResponse | null {
    if (!axios.isAxiosError(error)) return null;
    const data = error.response?.data;
    if (!data || typeof data !== 'object') return null;

    const body = data as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message : '';
    const code = typeof body.code === 'string' ? body.code : undefined;
    const success = typeof body.success === 'boolean' ? body.success : false;
    const id = typeof body.id === 'string' ? body.id : undefined;
    const existingAmount = typeof body.existingAmount === 'number' ? body.existingAmount : undefined;
    const existingLineTotal =
        typeof body.existingLineTotal === 'number' ? body.existingLineTotal : undefined;

    if (!message && !code && success !== false && id == null) return null;

    return {
        success,
        message,
        code,
        id,
        existingAmount,
        existingLineTotal,
    };
}

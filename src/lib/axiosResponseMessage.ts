import axios from 'axios';
import type { CommonResponse, ExistingDuplicateRow } from './types';

export const REPORT_MONTH_CLOSED_CODE = 'REPORT_MONTH_CLOSED';
export const REPORT_MONTH_TOO_EARLY_CODE = 'REPORT_MONTH_TOO_EARLY';

/** Текст ошибки из тела ответа API (axios бросает исключение при 4xx/5xx). */
export function getApiErrorMessage(error: unknown, fallback: string): string {
    const parsed = extractCommonResponseFromAxiosError(error);
    if (parsed?.message?.trim()) return parsed.message;
    return fallback;
}

export function isReportMonthClosedApiError(error: unknown): boolean {
    return extractCommonResponseFromAxiosError(error)?.code === REPORT_MONTH_CLOSED_CODE;
}

export function isReportMonthTooEarlyApiError(error: unknown): boolean {
    return extractCommonResponseFromAxiosError(error)?.code === REPORT_MONTH_TOO_EARLY_CODE;
}

export function isReportMonthClosedResponse(
    response: Pick<CommonResponse, 'code'> | null | undefined,
): boolean {
    return response?.code === REPORT_MONTH_CLOSED_CODE;
}

export function isReportMonthTooEarlyResponse(
    response: Pick<CommonResponse, 'code'> | null | undefined,
): boolean {
    return response?.code === REPORT_MONTH_TOO_EARLY_CODE;
}

/** Сообщение snackbar при ошибке добавления/изменения/удаления транзакции. */
export function getAccountancyMutationErrorMessage(
    errorOrResponse: unknown,
    t: (key: string) => string,
    fallback: string,
): string {
    if (errorOrResponse && typeof errorOrResponse === 'object' && 'code' in errorOrResponse) {
        const res = errorOrResponse as CommonResponse;
        if (isReportMonthClosedResponse(res)) {
            return t('accountancy.reportPeriodLockedAlert');
        }
        if (isReportMonthTooEarlyResponse(res)) {
            return t('accountancy.reportMonthTooEarlyAlert');
        }
        if ('success' in res && res.success === false && res.message?.trim()) {
            return res.message;
        }
    }
    if (isReportMonthClosedApiError(errorOrResponse)) {
        return t('accountancy.reportPeriodLockedAlert');
    }
    if (isReportMonthTooEarlyApiError(errorOrResponse)) {
        return t('accountancy.reportMonthTooEarlyAlert');
    }
    return getApiErrorMessage(errorOrResponse, fallback);
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
    const existingDuplicates = parseExistingDuplicates(body.existingDuplicates);

    if (!message && !code && success !== false && id == null) return null;

    return {
        success,
        message,
        code,
        id,
        existingAmount,
        existingLineTotal,
        existingDuplicates,
    };
}

function parseExistingDuplicates(value: unknown): ExistingDuplicateRow[] | undefined {
    if (!Array.isArray(value) || value.length === 0) return undefined;
    const rows: ExistingDuplicateRow[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const objectId = typeof row.objectId === 'number' ? row.objectId : Number(row.objectId);
        const objectName = typeof row.objectName === 'string' ? row.objectName : '';
        const roomName = typeof row.roomName === 'string' ? row.roomName : '';
        const amount = typeof row.amount === 'number' ? row.amount : Number(row.amount) || 0;
        const lineTotal = typeof row.lineTotal === 'number' ? row.lineTotal : Number(row.lineTotal) || amount;
        if (!Number.isFinite(objectId) || !roomName) continue;
        rows.push({
            objectId,
            objectName: objectName || String(objectId),
            roomName,
            amount,
            lineTotal,
        });
    }
    return rows.length > 0 ? rows : undefined;
}

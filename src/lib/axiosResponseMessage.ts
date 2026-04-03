import axios from 'axios';

/** Текст ошибки из тела ответа API (axios бросает исключение при 4xx/5xx). */
export function getApiErrorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data;
        if (data && typeof data === 'object' && 'message' in data) {
            const m = (data as { message?: unknown }).message;
            if (typeof m === 'string' && m.trim()) return m;
        }
    }
    return fallback;
}

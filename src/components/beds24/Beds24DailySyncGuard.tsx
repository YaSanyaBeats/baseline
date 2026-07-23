'use client';

import { useEffect } from 'react';
import { getApiUrl, apiClient } from '@/lib/api-client';

const STORAGE_KEY_PREFIX = 'beds24-ensure-daily:';

/**
 * При заходе в дашборд один раз за календарный день (на вкладку)
 * дергает /api/sync/ensure-daily — сервер сам решит, нужна ли синхронизация.
 */
export default function Beds24DailySyncGuard() {
    useEffect(() => {
        const dayKey = new Date().toISOString().slice(0, 10);
        const storageKey = `${STORAGE_KEY_PREFIX}${dayKey}`;

        try {
            if (sessionStorage.getItem(storageKey)) return;
            sessionStorage.setItem(storageKey, '1');
        } catch {
            // sessionStorage недоступен — всё равно дернем API (сервер отсечёт дубли)
        }

        apiClient.get(getApiUrl('sync/ensure-daily')).catch((error) => {
            console.error('Beds24 daily sync check failed:', error);
        });
    }, []);

    return null;
}
